# 豆包水印去除 Lab（独立版）

这是一个与现有 `omni` 项目完全独立的前端站点，实现：

1. 图片/视频上传与预览（默认显示第一帧）。
2. 拖拽框选水印区域（自动显示原始像素与百分比）。
3. 按像素局部修复（适配任意分辨率）。
4. 视频逐帧处理并导出（WebM）。
5. 可选接入 MinMax M3（OpenAI 风格接口）辅助识别坐标。

> 你给的测试素材路径：
> `C:\Users\Administrator\Desktop\测试用\角色服装替换.png`（1760x2208）
> `C:\Users\Administrator\Desktop\测试用\角色服装替换.mp4`（720x960）

## 一、快速使用（本地）

- 方式 A（推荐）：直接双击打开 `index.html`（静态页面，现代浏览器可直接运行）
- 方式 B：本地启动静态服务

```powershell
cd F:\omni\doubao-watermark-lab
python -m http.server 4173
# 打开 http://127.0.0.1:4173
```

## 二、使用流程

1. 上传图片或视频。
2. 在预览上拖拽设置水印矩形，或点击“自动定位（当前规则）”得到初始框。
3. 可手工填写 x/y/w/h 进行精调。
4. 点击“开始去水印”：
   - 图片：输出 `*-doubao-cleaned.[png/jpg/webp]`
   - 视频：输出 `*-doubao-cleaned.webm`

### 精确定位注意点

- 所有坐标都以“当前原始分辨率”落点，支持跨分辨率复用时请以同一比例核对。
- 你可以反复拖拽微调后再点击“应用坐标”。

## 三、MinMax M3 辅助识别

前端按钮 `调用 MinMax M3` 用于把当前预览帧发到模型，让模型返回 JSON 坐标。

- 默认 endpoint：`https://api.minimaxi.com/v1/chat/completions`
- 默认模型：`MiniMax-M3`
- 请求中已关闭 thinking，减少额外噪音。
- 示例图返回样例（当前 key + 示例图）：
  - `x=460, y=680, w=120, h=30`（可作为起始建议框）

安全提示：浏览器里直接填 `API Key` 会暴露给前端。生产场景请用你自己的服务端代理后再调用模型。

## 四、命令行：MinMax 坐标探测（可直接跑你给的测试图）

`scripts/minmax-bbox-probe.mjs` 可以用你本地 `MINMAX_API_KEY` 对单张图片直接拿回坐标（返回 JSON）。

```powershell
cd F:\omni\doubao-watermark-lab
$env:MINMAX_API_KEY = "你的key"
node .\scripts\minmax-bbox-probe.mjs --image "C:\Users\Administrator\Desktop\测试用\角色服装替换.png"
```

如需识别更严格的 prompt，可追加 `--prompt "..."`。

## 五、GitHub Pages 发布

仓库内新增了独立工作流：

- `.github/workflows/deploy-doubao-pages.yml`

推送到 `main` 后会自动把 `doubao-watermark-lab/**` 发布为 GitHub Pages 静态站点。

站点入口默认为：

- `https://<你的 GitHub 用户名>.github.io/<仓库名>/`

> 这条工作流不会影响当前 `omni` 主程序源码；属于纯静态独立站点。

## 六、GPT Site 发布说明（@sites）

为支持 GPT Sites 的发布入口，新增：

- `doubao-watermark-lab/.openai/hosting.json`

其中 `project_id` 请在你的 OpenAI Workspace 完成站点创建后替换为真实 ID（示例值占位）。`d1`、`r2` 继续保持 `null`（本项目无需数据库/对象存储）。

发布步骤（待你开放 `sites` 插件权限后）：

1. 在目标 Workspace 内创建一个站点项目（例如 `doubao-watermark-lab`）。
2. 将该项目 ID 写入 `doubao-watermark-lab/.openai/hosting.json` 的 `project_id`。
3. 运行工作流打包并部署（与该环境可用的 Site 发布链路一致）。
4. 部署成功后返回 `https://...` 的公开 GPT Site 链接给用户验收。
