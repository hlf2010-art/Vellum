# Teardown 源码复用笔记

研究版本为 [elvarofficial/teardown · a91262a](https://github.com/elvarofficial/teardown/tree/a91262ac1109051e014662d42ecb0b7bc1f113b1)。上游用技能说明指导 Claude 编写一个新场景，浏览器执行生成的 JavaScript。仓库随附 V8、Cessna 起落架、Strandbeest 三套可构建示例。机械蜂是展示动图。此技能采用项目已有网格和视口，另写了离线适配器。

| 上游实现 | 可复用的决定 | Mod Work 的具体落点 |
| --- | --- | --- |
| V8 的曲轴角驱动活塞、气门、选缸状态和读数。缸压由近似模型给出。 | 每个读数标明它描述的对象、状态与取值来源。角度和压力即使同步，证据性质也不同。 | 切换发带款式时同时切换模型、单件报告和问题列表。原始状态缺少独立报告时，只展示原始几何。 |
| Cessna 的齿条行程决定小齿轮角度，镜头可单独展示传动部分。 | 让用户改变一个有物理含义的输入，看相关部件怎样一起变化。 | 解释头部调整时，使用编辑器真实的头颈过渡和跟随结果，看眼球或发型相对位置。每个跟随关系分别核实。 |
| Strandbeest 由杆长约束求解关节，足迹从同一求解器采样。 | 用派生轨迹或采样说明运动，并用约束检验图形。 | 有真实姿态时，比较同一动作不同采样帧上的口沿间距。没有动作数据时，呈现静态采样和已记录的实机对照。 |
| 各例的 live 与 film 共用场景代码。V8 的操作脚本编排选缸、转速与相机，实时模式允许用户接管。 | 导览从用户能手动执行的操作组成，几何和判定可以复用。 | 教程可按“整件 → 选中局部 → 半透明 → 返回”回放。编辑工作区由用户显式启动或恢复导览，避免空闲时挪走正在比对的镜头。 |
| 录制入口可以按指定时间绘制，捕获脚本逐帧送编码器。时间线的关键点也用于抽帧。 | 按需实现可跳转的回放，验证具体状态。 | 按证据选取快照和镜头。测试 A→B→A 能恢复同一状态和读数。若交付视频，再看编码成品的关键帧，核对局部位置、文字和时序。声音仅在讲解需要时接入同一时间线。 |
| 打包器内联程序与字体，并可为大模型输出外置文件清单。live 示例还做着色器预热和画质分档。 | 发布形态与交互性能可以单独处理。 | 便携复查直接嵌入指定资产。确需外置文件时应成套交付，断网实测。保持项目原有布局与交互，出现首帧停顿再定位瓶颈。 |

代码入口：[V8 运动学](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/v8-shared/kin.js)、[Cessna 齿轮机构](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/cessna-shared/gear.js)、[步行连杆求解器](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/strandbeest-shared/jansen.js)、[实时接管](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/v8-shared/live.js)、[影片状态](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/v8-shared/film.js)、[离线打包](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/build.mjs)、[逐帧捕获](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/sims/capture.mjs)。如实际分发上游代码，请保留其 [MIT 声明](https://github.com/elvarofficial/teardown/blob/a91262ac1109051e014662d42ecb0b7bc1f113b1/LICENSE)。
