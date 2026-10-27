# Pet 角色与动作素材

设置 → Pet · 宠物提供三种角色，共用舞台、行为、让路和 Agent 状态。风格、活跃程度和尺寸保存在当前客户端的偏好里，不改 core 协议。

自制宠物见 [创作指南](creating-your-pet.md)（[English](creating-your-pet.en.md)）。设置 → Pet 中的「创作自己的宠物」随应用提供同一份指南，可离线查阅和复制。

- **Antumi · 软陶**：橙色圆头、长圆触角、深棕眼睛、赤陶色腹部；拟人的双手双脚，哑光软陶质感。
- **MOSS · 毛毡**：奶油白头部、鼠尾草绿身体与分节腹部、淡紫色脚和触角尖，缝线眼嘴；手作羊毛毡质感。
- **ZIP · 漫画**：深蓝色身体、珊瑚橙腹部、黄色手脚和触角尖，粗细变化的描线；平面漫画风格。

## 素材与提示词

默认软陶图集在 `packages/desktop/src/renderer/src/assets/pets/clay.webp`；MOSS 和 ZIP 的完整图集及头眼参数移至独立的 `flyhero/antumi-pets` 资源仓库，按需安装到 `ANTUMI_HOME/pets/`。分发与开发约定见 [资源包](resource-packs.md)。三套素材使用内置 imagegen，从这条会话中已展示的对应角色设定图分别生成。每套保留独立造型和材质，不是同一形象换色。

共用生成提示词：

> Create a production transparent sprite sheet for an anthropomorphic ant desktop companion. A square canvas with four equally sized columns and four equally sized rows. Sixteen isolated, complete poses; no titles, grids, opaque background or unrelated props. Keep the supplied character reference's identity, head size, proportions, colors, material, lighting and right-facing direction consistent. Two arms, two legs, bent antennae and a segmented ant abdomen. Draw genuine new poses rather than translating a static image. Standing feet use a consistent baseline. The last row is a coherent four-frame walk cycle with alternating legs and opposing arms.

每套追加的风格提示词：

- **clay**: Rounded tangerine head, long rounded elbow antennae, expressive dark-brown eyes with cream sclera, small body and agile rounded hands and feet, terracotta ant abdomen with two bands. Matte soft clay/vinyl animated-film style, no costume or realistic crawling insect anatomy.
- **moss**: Handmade needle-felt wool character, cream pebble head, sage-green torso and plump striped abdomen, lilac feet and antenna tips, mint elbow antennae, small charcoal stitched oval eyes and mouth, soft rosy cheeks and cream mitten hands. Delicate wool fibres, clean transparent edges, no ears or glossy cartoon eyes.
- **zip**: Modern hand-inked cartoon, variable-width navy outlines and flat fills with one shadow tone. Midnight-indigo head and body, coral-orange striped abdomen, butter-yellow mitten hands, flat-soled feet and antenna tips. Off-white expressive eyes, rounded diamond head and nimble limbs. No 3D shading or felt.

动作按从左到右、从上到下排列：

| 行 | 第 1 格 | 第 2 格 | 第 3 格 | 第 4 格 |
|---|---|---|---|---|
| 1 | 站立 idle | 等你 waiting | 原地工作 running | 查看 review |
| 2 | 失落 failed | 挥手 waving | 跳跃 jumping | 坐下 sit |
| 3 | 打盹 nap | 攀附 hang | 探头 peek | 冲刺 sprint |
| 4 | 右脚接触 | 左腿经过 | 左脚接触 | 右腿经过 |

生成后按透明连通区域提取完整角色，统一缩放、水平中心和脚底基线，排列为 1024 × 1024、4 × 4 的透明 WebP 图集。提取与排列不绘制新角色内容；表情和肢体姿势来自生成素材。

`PetSprite` 使用真实姿势帧切换；实际移动时改用独立的十二帧步态图集，到达或被打断后恢复当前心情，避免停在冲刺的腾空静帧。转身在两个朝向之间短暂交叉淡入，身体不经过横向缩放到零；位置与墙面旋转由外层独立处理。拖拽、落地和少量身体动作由舞台及 CSS 处理。减少动态效果时停用移动与循环，保留静态状态。

## 连续步态

每套资源的 `walk.webp`（内置软陶为 `assets/pets/clay-walk.webp`）各含 4 × 3 格十二帧，按行读取，生成提示词及逐帧导引见 [walk-prompts.md](walk-prompts.md)。角色保持原有材质和配色；动作包含前脚着地、身体经过支撑脚、后脚离地和抬腿回摆。图集以完整角色边界提取，统一比例、头部水平锚点和脚底基线。

运行时直接复用原图集的站姿头部，与下方逐帧的摆臂、迈步分层；走路、站立共享同一份脸和触角像素，不再各取一张比例略有区别的生成图。资源包的 `rig.json` 记录站姿与十二个步态帧在 256px 单格中的颈部锚点、脚底基线；每帧独立配准，将连接点和脚底映射到站姿位置。包含触角的总包围盒高度只用于素材初步排列，不再作为角色比例的唯一依据。图集提前解码，第一次走动无需等待图片加载。

舞台和皮肤共同读取 `petGait`：每个完整左右步周期前进约角色宽度的 0.42 倍。默认 120px 宠物以 70px/s 步行，一个周期 720ms；冲刺时速度和步频同时提高三倍。尺寸变化时速度按比例变化，步频保持一致；窗口后台和减少动态效果仍暂停动画。

## 开发预览

在 `packages/desktop` 运行 `pnpm dev:pet`：

- `http://127.0.0.1:5175/#pet-settings`：设置页，供本地开发检查风格切换、持久化和动作预览，不连接 core。
- `http://127.0.0.1:5175/#pet-playground`：同一套正式皮肤和舞台，检查心情、气泡、拖拽、禁区与减少动态效果。

正式 App 使用 `AppPet` 从已有会话和任务状态计算心情；需要用户输入或执行失败时提示并可打开对应会话或任务。窗口失焦时暂停；对话框、菜单或覆盖整个舞台的禁区出现时隐藏并停止拦截鼠标。

空闲时偶尔沿真实的侧栏边缘或面板竖向分隔线探头，复用站姿头部并以颈部为轴轻轻歪头。先连续移动到线旁，再利用遮挡藏入、滑出头部、两次张望、缩回并爬出，最后连续返回正常位置。身体与线后区域都被裁切，不占用不可见身体的鼠标区域。安静档、输入中、等待回答和减少动态效果时不主动触发，重复动作至少间隔 75 秒。分隔线移动或消失、进入禁区、收到新状态或开始输入时，从当前位置接续退出，不直接闪现回去；拖拽头部时接回完整宠物。

## 连续换位

有支撑时仍沿横线走、沿竖线爬；台阶不相连、缺少支撑或走路预计超过 15 秒时，由 `pet-flight.ts` 规划可见的跳跃或滑行。包含约 100ms 起跳准备、按距离与尺寸调整的 320–1600ms 空中移动，以及 160ms 落地缓冲。飞行过程中使用跳跃姿势，不再同时播放原地庆祝跳跃；位置关键帧从当前脚底连接到目标脚底，取消或暂停时读取当前屏幕位置，避免回到出发点。

路径按完整宠物尺寸扩张输入区、原生浏览器等禁区，再通过障碍边角规划绕行。空间不足时降低弧度或改为滑行；没有可达路径时放弃本次换位，不以淡出或瞬移穿过障碍。缩放窗口、提醒目标移动和被打断后的探头退出也使用连续位移。减少动态效果时保留直接定位的无动画处理。

## 眨眼与鼠标视线

三种宠物的清醒姿势都有独立的头部和双眼图层。资源包的 `rig.json` 保存各姿势的眼睛、颈部锚点和局部明暗差值；微笑闭眼、失落和打盹保留原有表情。步行与探头仍复用同一份站姿头部，不改变比例。软陶保留原图虹膜和高光，MOSS 保留绣眼像素，ZIP 使用与原图一致的平面眼白和瞳孔。

鼠标目标先投影回宠物自身坐标，抵消墙面旋转和左右朝向。舞台以最多每秒 30 次刷新视线，因此鼠标静止、宠物移动时也会继续追踪；双眼约 90ms 响应，头部约 240ms 缓动。常规姿势通过不超过 2.5° 的轻微倾斜固定整条连接线，避免旋转横向裁切时把举起的手臂撕开；探头只露头时保留轻微歪头。眨眼间隔随机为 2.8–6.4 秒，一次约 190ms，偶尔追加一次短眨眼。后台、隐藏和减少动态效果时暂停，睡觉时保持原有闭眼。

鼠标持续在身体另一侧超过 220ms 时转身，身体中线两侧各保留宽度 30% 的缓冲，转身后冷却 650ms，避免在中间来回翻转。判断使用转身前后不变的脚底中心，不以镜像后会移动的脸部中心为准。转身与动作脚本串行，不打断当前姿势；走路、爬墙、拖拽、探头、睡觉和一次性动作期间保留动作朝向，到达后再看向鼠标。

新增 `packages/desktop/src/renderer/src/assets/pets/face-textures.webp`（288 × 80），只用于填补眼睛后方的小块材质，其余角色像素保留原图。该材质使用内置 imagegen 编辑三种角色的站姿合照，再裁切、缩放为三列；各姿势通过 SVG 遮罩与明暗修正使用，未重新生成整只角色。

此次内置 imagegen 的完整提示词：

> Use case: precise-object-edit. Edit target: the supplied three-character sprite contact image, 1536x580. Make a clean facial texture plate for runtime eye animation. Remove ONLY the two eyes from EACH of the three characters (six eyes total), filling those tiny holes seamlessly with the adjacent face material and the correct local lighting/color: orange clay on left, cream wool felt in middle, indigo flat fill on right. Keep the eyebrows, mouths, blush, head contours, antennae, every body part, exact character positions, pixel dimensions, scale and spacing unchanged. Keep the same neutral background. Do not replace eyes with closed eyelids or lines: the eye positions should be blank face material. This is an inpainting task with minimal edits, no redesign. Output exact same layout and resolution as reference.
