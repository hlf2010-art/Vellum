"""Source-only mocks: no listener, token reads, network, render, or service actions."""
import ast
import io
import json
from pathlib import Path
import runpy
import sys
import threading
import types
import unittest
from unittest.mock import Mock, MagicMock, patch

ROOT = Path(__file__).resolve().parent
LAUNCHER = ROOT.parent.parent / 'Start MOD WORK Image Service.command'

class SafetyTests(unittest.TestCase):
    def setUp(self):
        # Load only the exact stop function AST, not backend import side effects.
        tree = ast.parse((ROOT / 'backend.py').read_text())
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'stop_windows_service')
        from urllib.request import Request
        self.b = dict(_ctrl_token=Mock(return_value='test-token'), Request=Request,
                      STOP_URL='http://example.invalid/stop', http=MagicMock(), json=json,
                      set_service_stopped=Mock(), fetch=Mock(side_effect=AssertionError('Unexpected interrupt')))
        exec(compile(ast.Module(body=[fn], type_ignores=[]), str(ROOT/'backend.py'), 'exec'), self.b)
        backend = types.ModuleType('backend')
        names=('generate fetch JOBS BASE ServiceStoppedError is_service_stopped set_service_stopped '
               'stop_windows_service submit_video execute_video_job get_video_job get_video_asset_path').split()
        for name in names:setattr(backend,name,Mock())
        backend.ServiceStoppedError = type('ServiceStoppedError',(RuntimeError,),{})
        backend.is_service_stopped = Mock(return_value=False)
        inv=types.ModuleType('inventory')
        inv.MODELS={'zimage':{'name':'mock'}}
        for name in ('inventory','video_inventory','assets','graph'):setattr(inv,name,Mock())
        sampling=types.ModuleType('sampling'); sampling.Sampling=Mock()
        with patch.dict(sys.modules,backend=backend,inventory=inv,sampling=sampling):
            self.g=runpy.run_path(str(LAUNCHER),run_name='isolated_test')
        # Function globals, not runpy's returned shallow copy.
        self.g=self.g['Handler'].do_POST.__globals__
        self.g['video_executor'].shutdown(wait=False)
        self.g['video_executor']=Mock()
    def tearDown(self):
        self.assertFalse(self.g['generation'].locked(), 'Admission lock leaked')
    def request(self,path,payload=None):
        h=object.__new__(self.g['Handler']);h.path=path
        data=json.dumps(payload or {}).encode()
        h.headers={'X-Studio-Client':'canvas','Content-Length':str(len(data))}
        h.rfile=io.BytesIO(data);h.permitted=lambda:True
        h.reply=Mock();h.error=Mock()
        h.do_POST()
        return h
    def response(self,value):
        self.b['http'].open.return_value.__enter__.return_value=io.StringIO(json.dumps(value))
    def test_missing_token_zero_remote_calls(self):
        self.b['_ctrl_token'].return_value=''
        with self.assertRaises(RuntimeError):self.b['stop_windows_service']()
        self.b['http'].open.assert_not_called();self.b['fetch'].assert_not_called()
    def test_unacknowledged_stop_not_marked(self):
        for response in ({}, {'stopped':False}, {'stopped':'true'}, []):
            self.response(response)
            with self.assertRaises(RuntimeError):self.b['stop_windows_service']()
        self.b['set_service_stopped'].assert_not_called()
    def test_acknowledged_stop(self):
        self.response({'stopped':True,'terminated':False})
        self.assertTrue(self.b['stop_windows_service']()['stopped'])
        self.b['set_service_stopped'].assert_called_once_with(True)
        self.b['fetch'].assert_not_called()
    def test_network_failure_not_marked(self):
        self.b['http'].open.side_effect=OSError('offline')
        with self.assertRaises(OSError):self.b['stop_windows_service']()
        self.b['set_service_stopped'].assert_not_called()
    def test_busy_stop_even_confirm_interrupt(self):
        lock=self.g['generation'];lock.acquire()
        try:h=self.request('/service/stop',{'confirm_interrupt':True})
        finally:lock.release()
        self.assertEqual(h.error.call_args.args[0],409)
        self.g['stop_windows_service'].assert_not_called()
    def test_queued_video_blocks_stop(self):
        self.g['active_jobs']['x']='video'
        h=self.request('/service/stop')
        self.assertEqual(h.reply.call_args.args[0],409)
        self.g['stop_windows_service'].assert_not_called()
    def test_stop_failure_truthful_and_releases(self):
        self.g['stop_windows_service'].side_effect=OSError('fail')
        h=self.request('/service/stop')
        self.assertEqual(h.error.call_args.args[0],503);h.reply.assert_not_called()
    def test_stop_blocks_both_admissions_and_second_stop(self):
        seen=[]
        def stop():
            self.assertTrue(self.g['generation'].locked())
            for path in ('/image','/media/video','/service/stop'):
                h=self.request(path,{'prompt':'test'})
                seen.append(h.error.call_args.args[0])
            return {'stopped':True}
        self.g['stop_windows_service'].side_effect=stop
        h=self.request('/service/stop')
        self.assertEqual(seen,[429,429,409]);self.assertEqual(h.reply.call_args.args[0],200)
        self.g['generate'].assert_not_called();self.g['submit_video'].assert_not_called()
    def test_video_reservation_and_schedule_under_same_lock(self):
        def submit(*a,**kw):
            self.assertTrue(self.g['generation'].locked())
            h=self.request('/service/stop');self.assertEqual(h.error.call_args.args[0],409)
            return {'job_id':'test','status':'queued'},True
        def schedule(*a):
            self.assertTrue(self.g['generation'].locked())
            self.assertEqual(self.g['active_jobs'],{'test':'video'})
        self.g['submit_video'].side_effect=submit
        self.g['video_executor'].submit.side_effect=schedule
        h=self.request('/media/video',{'prompt':'test'})
        self.assertEqual(h.reply.call_args.args[0],202)
        h=self.request('/service/stop');self.assertEqual(h.reply.call_args.args[0],409)
    def test_video_validation_releases(self):
        h=self.request('/media/video',{'prompt':''})
        self.assertEqual(h.error.call_args.args[0],400)
    def test_stopped_submissions_no_network_or_queue(self):
        self.g['is_service_stopped'].return_value=True
        for path in ('/image','/media/video'):
            h=self.request(path,{'prompt':'test'});self.assertEqual(h.reply.call_args.args[0],503)
        self.g['generate'].assert_not_called();self.g['submit_video'].assert_not_called()
    def test_concurrent_stop_rejects_submissions_without_waiting(self):
        entered=threading.Event(); release=threading.Event()
        def stop():
            entered.set()
            if not release.wait(2):raise RuntimeError('test timeout')
            return {'stopped':True}
        self.g['stop_windows_service'].side_effect=stop
        result=[]
        worker=threading.Thread(target=lambda:result.append(self.request('/service/stop')))
        worker.start()
        try:
            self.assertTrue(entered.wait(1))
            for path in ('/image','/media/video'):
                h=self.request(path,{'prompt':'test'})
                self.assertEqual(h.error.call_args.args[0],429)
        finally:
            release.set();worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(result[0].reply.call_args.args[0],200)
    def test_image_output_contract_and_lock_release(self):
        self.g['Sampling']=MagicMock()
        class FakePath:
            def __truediv__(self,other):return self
            def read_text(self):return '{"prompt_id":"mock-id"}'
        self.g['JOBS']=FakePath()
        def generate(*args):
            self.assertTrue(self.g['generation'].locked())
            h=self.request('/service/stop')
            self.assertEqual(h.error.call_args.args[0],409)
            return b'png-bytes'
        self.g['generate'].side_effect=generate
        h=self.request('/image',{'prompt':'test'})
        h.reply.assert_called_once_with(200,b'png-bytes','image/png')
        self.assertEqual(h.job,'mock-id');self.assertEqual(self.g['active_jobs'],{})
    def test_worker_holds_same_lock_at_actual_prompt(self):
        tree=ast.parse((ROOT/'backend.py').read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='execute_video_job')
        block=next(n for n in fn.body if isinstance(n,ast.With))
        self.assertEqual(ast.unparse(block.items[0].context_expr),'gpu_lock')
        self.assertTrue(any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='fetch'
                            and n.args and isinstance(n.args[0],ast.Constant) and n.args[0].value=='/prompt'
                            for n in ast.walk(block)))

if __name__=='__main__':
    # Any accidental socket network use fails the entire test, including imports.
    with patch('socket.socket',side_effect=AssertionError('No network allowed')):
        unittest.main()
