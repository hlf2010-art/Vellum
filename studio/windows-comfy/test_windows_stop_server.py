import importlib.util
import pathlib
import unittest
from unittest.mock import patch, Mock

P = pathlib.Path(__file__).with_name('windows-stop-server.py')
spec=importlib.util.spec_from_file_location('stop_server', P)
m=importlib.util.module_from_spec(spec)
with patch('pathlib.Path.write_text', side_effect=AssertionError('Import wrote credential')):
    spec.loader.exec_module(m)
TARGET={'pid':42,'exe':'trusted.exe','command':'exact command','ticks':'1234'}

class StopTests(unittest.TestCase):
    def run_stop(self, snapshots, idle=None, kill=None):
        with patch.object(m,'inspect_target',side_effect=snapshots), patch.object(m,'require_idle',side_effect=idle) as q, patch.object(m,'terminate_verified',side_effect=kill) as k, patch.object(m.time,'sleep'):
            result=m.stop_comfy_process()
            return result,q.call_count,k.call_count
    def test_import_no_token(self): self.assertIsNone(m.TOKEN)
    def test_absent_noop(self):
        r,q,k=self.run_stop([None]);self.assertEqual((r[0],r[1]['terminated'],q,k),(200,False,0,0))
    def test_busy(self):
        r,q,k=self.run_stop([TARGET], RuntimeError('busy'));self.assertEqual((r[0],k),(409,0))
    def test_unknown(self):
        r,q,k=self.run_stop([RuntimeError('unreachable')]);self.assertEqual((r[0],k),(409,0))
    def test_reused_pid(self):
        r,q,k=self.run_stop([TARGET,dict(TARGET,ticks='5678')]);self.assertEqual((r[0],k),(409,0))
    def test_busy_on_recheck(self):
        r,q,k=self.run_stop([TARGET,TARGET],[None,RuntimeError('busy')]);self.assertEqual((r[0],k),(409,0))
    def test_kill_failure(self):
        r,q,k=self.run_stop([TARGET,TARGET],kill=RuntimeError('denied'));self.assertFalse(r[1]['stopped']);self.assertEqual(k,1)
    def test_success_requires_exit_and_listener_gone(self):
        r,q,k=self.run_stop([TARGET,TARGET,None]);self.assertEqual((r[0],r[1]['terminated'],q,k),(200,True,2,1))
    def test_listener_remains(self):
        r,q,k=self.run_stop([TARGET]*12);self.assertFalse(r[1]['stopped']);self.assertEqual(k,1)
    def test_identity_exact(self):
        with patch.object(m,'powershell',return_value=TARGET),patch.object(m,'EXPECTED_EXE','trusted.exe'),patch.object(m,'EXPECTED_COMMAND','exact command'):
            self.assertEqual(m.inspect_target(),TARGET)
            with patch.object(m,'EXPECTED_COMMAND','another'):
                with self.assertRaises(RuntimeError):m.inspect_target()
    def test_queue_shapes(self):
        for data in ({},None,{'queue_running':None,'queue_pending':[]},{'queue_running':[1],'queue_pending':[]}):
            with patch.object(m.http,'open') as o,patch.object(m.json,'load',return_value=data):
                with self.assertRaises(RuntimeError):m.require_idle()
        with patch.object(m.http,'open'),patch.object(m.json,'load',return_value={'queue_running':[],'queue_pending':[]}):m.require_idle()
    def test_kill_response_validation(self):
        with patch.object(m,'powershell',return_value={'exited':False}):
            with self.assertRaises(RuntimeError):m.terminate_verified(TARGET)
if __name__=='__main__':unittest.main()
