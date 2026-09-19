# GitHub Pages 部署

## 直接上传已构建网站（无需安装开发工具）

1. 在 GitHub 新建仓库，例如 `review-study`。Pages 通常使用公开仓库；网页不包含你的学习记录和密钥。
2. 解压提供的 `review-pages-static.zip`，上传其中所有文件及目录到仓库根目录。必须包含 `.nojekyll`，不要再套一层文件夹。
3. 仓库 Settings → Pages → Build and deployment，选择 Deploy from a branch，分支 `main`、目录 `/ (root)`，保存。
4. 等待 Pages 构建完成，打开其显示的网址。支持项目子目录，无须绑定域名。

## 从源代码自动部署

上传提供的源代码包后，在 Settings → Pages 中选择 GitHub Actions。仓库的 `.github/workflows/pages.yml` 会自动安装依赖、构建并发布。以后更新 main 即自动发布。

本地构建：Node.js 22.13+，运行 `npm ci` 和 `npm run build:pages`。输出目录为 `pages-dist/`。本地预览应通过 HTTP 服务打开，不要直接双击 index.html。

## 静态版与私有完整版

Pages 版支持本地知识与掌握度、全部题型手动导入、已导入的 SAT/ACT/TOEFL 模拟、口语录音与自评、笔记、复习计划、周期表和备份。

GitHub Pages 不运行服务器，因此不提供 AI 调用、账号登录、私有云同步或 AI 写作批改。需要这些功能时，从「我的」打开现有私有完整版：https://review-study-kevin.shivrdream.chatgpt.site/ 。主观题可在报告中改为手动自评。

两个域名的浏览器存储相互独立。迁移时先在旧网站导出个人数据备份，再到新网站的数据中心导入。不要把个人备份、教材、录音、`.env`、令牌或服务器凭据上传到 GitHub。

若以后需要 Pages 前端也直接使用 AI/云同步，需要另行部署带身份验证、允许指定来源的后端；当前私有站采用同源登录保护，不能简单把 API 地址改为跨域地址，也不要将服务端密钥加密后放进浏览器代码。

考试界面使用用户提供的 ExamSimulator Source v0.11.0 网页运行时进行适配。官方外观仅用于学习模拟；成绩不换算官方量表。
