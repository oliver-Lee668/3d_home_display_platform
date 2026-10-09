将真实的家具/家电 glTF/GLB 模型文件放在此目录。

用法：
1. 把模型文件（如 sofa.glb）放入 public/models/
2. 打开 src/data/catalog.ts，将对应商品的 model 字段改为：
   model: { kind: 'gltf', ref: '/models/sofa.glb' }
3. 保存后刷新即可。模型会自动等比缩放到商品 size 的最大边、底面对齐地面、水平居中。

说明：
- 建议使用 GLB（单文件、含贴图），并做减面与 Draco/meshopt 压缩以优化加载。
- glTF 模型保留其自带材质；如需颜色/材质变体，请提供多个模型文件，或后续接入贴图切换。
- 模型坐标系建议：+Y 朝上，原点在底面中心。
