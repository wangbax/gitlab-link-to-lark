# GitLab link to Lark

一个浏览器插件，用于提供 GitLab 项目中关联的飞书项目 ID 转换为飞书链接。方便在 GitLab 项目中快速跳转查看飞书项目信息。
[飞书参考资料](https://bytedance.larkoffice.com/wiki/XusFwYp2ZiqltkkSTaJc7eMdnYb)

# 功能预览

<img src="./docs/preview1.png" alt="preview1"  />
<img src="./docs/preview2.png" alt="preview2"  />

# 安装

## 商店安装

[Chrome 应用商店](https://chromewebstore.google.com/detail/gitlab-link-to-lark/ocmkgfnifakgckfeofcoakiniljdjcfp)

## 本地开发安装

### 1. 克隆项目

```bash
git clone https://github.com/wangbax/gitlab-link-to-lark.git
cd gitlab-link-to-lark
```

### 2. 安装依赖

要求：Node.js >= 18

```bash
# 使用 yarn（推荐）
yarn install

# 或使用 npm
npm install
```

### 3. 构建项目

```bash
# 使用 yarn
yarn build

# 或使用 npm
npm run build
```

构建完成后，产物会生成在 `dist` 目录中。

### 4. 在浏览器中加载扩展

#### Chrome/Edge 浏览器

1. 打开浏览器，访问扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

2. 开启右上角的「开发者模式」

<img src="./docs/install-1.png" alt="install"  />

3. 点击「加载已解压的扩展程序」

<img src="./docs/install-2.png" alt="install"  />

4. 选择项目的 `dist` 文件夹

<img src="./docs/install-3.png" alt="install"  />

5. 扩展安装成功！

### 5. 配置扩展

安装完成后，点击扩展图标或在扩展管理页面点击「选项」进行配置：

<img src="./docs/install-4.png" alt="install"  />

需要配置以下信息：
- **飞书命名空间**：你的飞书项目空间名称（如：`pojq34`）
- **项目 ID 前缀**：GitLab 中使用的项目 ID 前缀，多个用逗号分隔（如：`TAP,M,F`）

**注意**：
- `M-xxx` 会自动识别为 Story 类型
- `F-xxx` 会自动识别为 Issue 类型  
- 其他自定义前缀（如 `TAP-xxx`）会自动动态判断是 Story 还是 Issue

## 开发说明

### 目录结构

```
├── dist/               # 构建产物
├── src/
│   ├── js/            # JavaScript 源码
│   │   ├── background.js  # 后台脚本
│   │   ├── index.js       # 内容脚本
│   │   ├── options.js     # 配置页面
│   │   └── ...
│   ├── html/          # HTML 页面
│   └── assets/        # 静态资源
├── gulpfile.js        # 构建配置
└── package.json
```

### 开发模式

```bash
# 监听文件变化并自动构建
npm run watch
```

修改代码后，需要在浏览器扩展管理页面点击「重新加载」按钮。

# 使用

配置完成后，访问 GitLab 项目页面，插件会自动将 `#TAP-xxx`、`#M-xxx`、`#F-xxx` 等格式的项目 ID 转换为可点击的飞书链接。

# Preview

<img src="./docs/preview.png" alt="preview"  />
