# 项目接入与案例

路径从含有 `fit-studio/` 的仓库根计算。字段与定位入口以目标 checkout 为准。不同平台或安装实例可能持有不同版本。

| 要解释的现象 | 从这里开始 | 读数与画面的边界 |
| --- | --- | --- |
| 护具嵌入或悬空 | `fit-studio/server/mesh-service.mjs` 的 `getViewportMesh`、`stringifyViewportMesh`；`fit-studio/src/FitViewport.jsx` 的 `uploadScene`、`onMeshInfo`、`focusRequest`；`fit-studio/src/fit-inspect.js` 的 `computeEmbedClusters`、`blockedAdvice` | 原始与贴合坐标分别在 rest / fitted。signedMm 已是毫米；身体坐标和取景半径用游戏单位，每单位为 10 mm。用项目判定处理测量窗口、原版设计性贴体和遮蔽。负值顶点的聚簇只负责定位，面边穿入有单独采样。 |
| 头颈、眼球或外部发型联动 | `fit-studio/src/AppearanceEditor.jsx`、`fit-studio/server/head-edit.mjs`、`fit-studio/server/hair-follow.mjs` | 锁定同一球员、已加载的部件与编辑基准，优先复用真实前后状态。只有截图时用标注指出可见变化。 |
| 球衣紧贴、随动作穿入 | `fit-studio/src/garment-clearance.js`、`GarmentCheckCard.jsx`（同目录）、`FitViewport.jsx` 的服装变形与测量 | 衣服表面采样与护具逐顶点阵列有不同含义。视口飘动只服务预览；将姿态、实际加载版本和游戏观察另列。 |

## 已有交互与导览的分工

护具工作区已实现实体 / X 光 / 仅护具、原始与贴合擦除对比、热图、嵌入聚簇、自动或手动飞到问题点。可在 `fit-studio/src/App.jsx` 搜索「擦除对比」「嵌入问题点」，在 `FitViewport.jsx` 搜索 `computeEmbedClusters`、`bodyModeNow`。讲解这些能力时先带用户去已有入口。

离线导览增加独立的演示状态：原位轮廓、仅供说明的抬升、沿平面剖视、与剖切同步的截线及有依据的局部标记。导览使用一条可拖动的时间线；准确的单件读数从快照读取，最终诊断可回到原生复查视口核对。截线是几何交线，不代替项目的距离与面边采样算法，也不是游戏动作模拟。

## 有报告、无原始模型时的工作示例

仓库的 `docs/agent-history/2026-11-02-parish-kneepad-investigation.md` 记录了 Parish 复古护膝下口。先核对报告的日期、输入和 A/B 顺序，再引用其历史结果。

- 基准静态检查每侧 3704 个面边采样，未检出穿入。探针仅看下口区域，在四个体型通道共同起作用的假设下，每侧 175 个顶点均在体表之外，但 1475 个面边采样有 7 个穿入，最深 0.287 mm。这两组采样区域与数量不同。页面若并列展示，应分别标注。
- 游戏内屏蔽四个通道后，使用者报告问题消失或明显减轻，恢复原包后再次出现。这支持四通道整体参与了该案例。单通道的贡献、其他体型和动作仍待验证。
- 案例缺少该姿态的原始网格时，可交付上述对照和来源。画局部示意时明确标明示意，避免把推测的接触点标成游戏测量。永久修正仍需另行验证。上缘外翻是另一次排查，见 `docs/agent-history/2026-11-03-parish-kneepad-upper-rim.md`。

## 用真实快照验收离线页

以 `hb-viewport3.json` 为例，在「测量」暂停换款。下列是三份单件报告的读数。身体均未标定；通过只描述这次静态检查。

| 发带 ID | 静态判定 | 面边穿入 / 采样 | 嵌入顶点 / 受检 | 顶点最小有向距离 |
| --- | --- | ---: | ---: | ---: |
| headband | 严重风险：面边穿入 | 9 / 3484 | 1 / 217 | −3.338 mm |
| headband_fury | 通过 | 0 / 2630 | 0 / 196 | +3.638 mm |
| headband_tie | 严重风险：面边穿入 | 28 / 3983 | 0 / 508 | +3.335 mm |

本例的标准发带还有可单独复核的几何裂缝。比较从零开始编号的顶点 80 和 109，它们位于原始网格同一条接缝的两侧，原始坐标相同。贴合后的坐标相差 3.06643 个游戏单位，约 30.7 mm。用同一角度看「原始护具」和「贴合结果」即可复核形变。

在「自由复查」切换原始与贴合状态，确认原始几何只显示适用的信息。返回导览时，保留所选件、时间和原有播放状态。绑带款只有面边穿入计数，不能画出 28 处位置。普通款上的圆点对应受检顶点，不代表九个面边采样的位置。

要复验本例，可在装有 Playwright 的目录（如 `MODWORK_REPO`）运行 `node "$SKILL_DIR/scripts/check-headband.mjs" "$OUT_DIR/headband-review.html"`（`SKILL_DIR`、`OUT_DIR` 见 SKILL.md 的环境准备），需要 Playwright 和 Chromium，支持与录制脚本相同的 PLAYWRIGHT_MODULE、CHROMIUM 覆盖。脚本断网操作实际页面，核对截线像素、三款报告、换款、复查往返、键盘焦点及小屏布局。末尾可加一个新目录路径保存截图。
