# 软陶宠物的打字姿势

使用内置 `image_gen` 生成，参考 `clay.webp` 的角色和材质。
原始画布 1254 × 1254、透明背景，等比缩小为 512 × 512 后由浏览器 Canvas
导出 WebP（质量 0.95），保留 alpha。

- `clay-typing.webp`：双手放在键盘上的完整姿势。
- `clay-typing-base.webp`：移除手臂并补全胸部和键盘的底图。

`clay-manifest.json` 的 `rig.typing` 保存裁切轮廓、肩部支点、抬手角度和周期。
通用的 `PetWorkstation.tsx` 从完整姿势裁出两只手臂，以肩部为支点交替抬起，底图固定；MOSS 和 ZIP 也使用同一播放逻辑。
不能只在完整姿势上叠加移动的手臂，否则会留下原来的手。
肩部、裁切轮廓与坐标基于这两张配对素材；替换素材时需要一起重新对齐。

打字图的头部比站姿偏大，`rig.typing.scale` 设为 0.9，以画布底部中央为支点统一缩放底图和双臂，使切换姿势时角色大小接近站姿。

## 生成提示词

### 完整姿势

Use case: stylized-concept. Create ONE production game sprite on a truly transparent background. The supplied atlas is ONLY a character/style reference: reproduce the SAME cute orange Antumi clay ant, large round orange head, big glossy brown eyes, two thick bent orange antennae ending in golden yellow tips, round red-orange abdomen, soft handmade polymer clay, warmly lit 3D toy. Do not reproduce the atlas grid. Draw a SINGLE ant, three-quarter profile facing RIGHT, sitting low with both feet resting at the bottom, using a small laptop resting across its knees. The laptop must look like a beautifully crafted tiny rounded clay toy in warm cream with a charcoal inset screen and a softly rounded ivory keyboard with actual molded small keys, subtle bevels and soft ambient occlusion; no black outlines, no SVG/icon-like drawing, no thin table/stand, no text, logo, terminal glyph or symbols. The ant looks at the laptop SCREEN, happily focused. CRITICAL POSE: both forearms extend FORWARD AND DOWN to the keyboard. TWO DISTINCT SEPARATED PALMS are flat, facing DOWN, with visible little rounded finger tips contacting two different keyboard areas. The hands must NOT touch each other, must NOT be cupped together, must NOT be held at chest height. Elbows slightly bent. Keep both arms clearly visible without crossing. This must instantly read as TYPING at 80px. Composition: entire ant and laptop in one square image, centered with even small transparent margins, feet and laptop base on a common stable baseline at 94% image height. Preserve reference proportions and toy material; ant remains main subject, laptop is compact, not larger than head. Soft studio key light upper left. Clean alpha edges, no backdrop, no grid, no labels, no decorations, no extra ant.

### 动画底图

Use case: precise-object-edit. This is the CLEAN BASE LAYER of a layered game animation; the original two arms will be placed back as independently animated layers. Edit ONLY the ant's two orange ARMS from the shoulder down including both hands and fingers resting on the keyboard. Remove both entire arms and both hands. Reconstruct the orange torso that was behind the upper arms and reconstruct the cream keyboard and laptop that were behind the forearms and fingers. Leave the exact SAME ant head, face, eyes, antennae, torso silhouette, abdomen, knees, feet, laptop screen, laptop base, every key outside the arm regions, lighting, shadows, camera, pixel position, image dimensions, size and framing UNCHANGED. Do NOT move, scale, rotate or redraw the scene. Do NOT change any pixels outside the two arms' footprints and their tiny shadows. Keep the lower body and laptop pixel-stable. It should be exactly the same sprite with only the arms/hand silhouettes removed, ready for the original arm layers to be composited back. Keep genuine transparency and the same square canvas. No new objects, no extra limbs, no text, no background.
