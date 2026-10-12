# Songlist Studio

浏览器本地曲目表管理器。支持主表导入、连续追加子表、搜索、曲目和完整 JSON 编辑、删除、撤销、详细检查、下载初始文件及导出修改版。

## 使用

打开 `index.html` 即可使用，建议通过本地 HTTP 服务或 GitHub Pages 打开。

1. 导入主 songlist。页面保留初始 File 数据，点击“下载初始文件”可下载原文件名和原始字节。
2. 追加子表，可多选或反复追加。支持 songs 对象、单曲对象和单曲片段末尾的逗号；重复 ID 忽略大小写，跳过并报告。
3. 点击曲名编辑单曲 JSON，或点击“编辑完整表”。修改后点击“应用并检查”。可多选删除和撤销最近 30 次操作。
4. 检查结果区分错误和提醒。错误暂停修改版导出，提醒可由用户人工确认。原始文件始终可以下载，包括存在 JSON 错误的输入。
5. 导出文件名为 `主songlist<本地时间>导出版`，用于游戏时将文件名改为 `songlist`。

页面不会自动备份或上传曲目表。当前会话保存在内存，刷新或关闭后会丢失；操作完成后请下载。主表、子表支持 UTF-8、带 BOM 的 UTF-16、GB18030，单文件限制 20 MB。

语法提示包括文件名、原始行列号、上下文、定位箭头、可能原因和建议。严格解析拒绝重复键、非法数字、超出 JavaScript 安全整数范围的值；Unicode 和额外字段保留。

资源检查可选择包含 Charts / Documents 的项目根目录，也支持选择 Charts 或 songs 文件夹。检查目录、base 文件、正等级 AFF 和背景路径，以及空的基础资源。它不检测音频时长、完整 AFF 语法或游戏运行兼容性。

## 发布到 GitHub Pages

1. 新建仓库 `songlist-manager`。
2. 将本目录的 `index.html`、`style.css`、`core.js`、`app.js` 和 `.nojekyll` 上传到仓库根目录。
3. 仓库 Settings → Pages → Build and deployment → Deploy from a branch。
4. 选择 `main` 和 `/ (root)` 并保存。
5. 部署完成后，访问 `https://<用户名>.github.io/songlist-manager/`。

静态页面使用相对资源路径，无构建步骤、API 密钥、第三方脚本或 CDN 依赖。GitHub 托管的是程序文件，选中的本地 songlist 由浏览器处理。

## 开发检查

`node --test core.test.js`

本地预览：在本目录运行 `python -m http.server 18864 --bind 127.0.0.1`，打开 `http://127.0.0.1:18864/`。
