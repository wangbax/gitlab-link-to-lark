# GitLab link to Lark

一个浏览器插件，用于提供 GitLab 项目中关联的飞书项目 ID 转换为飞书链接。方便在 GitLab 项目中快速跳转查看飞书项目信息。
[飞书参考资料](https://bytedance.larkoffice.com/wiki/XusFwYp2ZiqltkkSTaJc7eMdnYb)

## ✨ 主要功能

- 🔗 **自动转换链接**：将 GitLab 中的 `#TAP-xxx`、`#M-xxx`、`#F-xxx` 等格式自动转换为飞书链接
- 🎯 **智能类型识别**：根据 commit 类型前缀自动判断是 Issue 还是 Story
  - `fix:`、`bugfix:`、`hotfix:` → Issue
  - `feat:`、`chore:`、`refactor:` → Story
- 💡 **自定义 Tooltip**：显示 "Issue in Lark" 或 "Story in Lark"，替代 GitLab 原生的 "Issue in Jira"
- 🚀 **实时监听**：自动检测页面变化、标签切换、URL 变化
- ⚡ **性能优化**：防抖机制、智能缓存、避免重复处理
- 🔄 **类型统一**：确保同一 tid 的所有链接类型一致

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
- **飞书命名空间**：你的飞书项目空间名称，支持多个，用逗号分隔（如：`pojq34,app1,app2`）
  - 插件会自动尝试每个命名空间，直到找到有效的那个
- **项目 ID 前缀**：GitLab 中使用的项目 ID 前缀，多个用逗号分隔（如：`TAP,M,F`）

**注意**：
- `M-xxx` 会自动识别为 Story 类型
- `F-xxx` 会自动识别为 Issue 类型  
- 其他自定义前缀（如 `TAP-xxx`）会根据上下文智能判断：
  - commit message 包含 `fix:`、`bugfix:`、`hotfix:` → Issue
  - commit message 包含 `feat:`、`chore:`、`refactor:` → Story
  - 后端会进一步验证并自动更正类型
- 多个飞书命名空间会按配置顺序依次尝试，并缓存有效的结果

## 智能类型识别

插件会根据以下规则自动判断链接类型：

### 1. 前缀优先
- `M-xxx` → Story
- `F-xxx` → Issue

### 2. 上下文分析（针对其他前缀）
扫描链接所在的 commit message、标题等上下文：

**Issue 类型**（修复类）：
- `fix: 修复登录问题 #TAP-123456789`
- `bugfix: 解决崩溃 #TAP-123456789`
- `hotfix: 紧急修复 #TAP-123456789`

**Story 类型**（功能/任务类）：
- `feat: 新增用户中心 #TAP-123456789`
- `chore: 更新依赖 #TAP-123456789`
- `refactor: 代码重构 #TAP-123456789`

### 3. 后端验证
插件会向飞书 API 请求实际类型，并自动更新所有相同 tid 的链接。

## 使用场景

### Merge Request 标题
```
fix: [AutoTest] Android 三方授权页面顶部无 title #TAP-6581113659
                                              ↓
                                   自动识别为 Issue
```

### Commit 列表
```
feat: 新增分享功能 #TAP-123456789
                ↓
        自动识别为 Story
```

### 页面自动刷新
- ✅ 切换到 Commits 标签 → 自动扫描新链接
- ✅ 切换到 Changes 标签 → 自动扫描新链接
- ✅ 浏览器前进/后退 → 自动扫描新链接

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

## 更新日志

### v2.1.0 (2024-12-12)

**新增功能：**
- ✨ 自定义 Tooltip：显示 "Issue in Lark" / "Story in Lark"
- ✨ 智能类型识别：根据 commit 类型前缀自动判断 Issue/Story
- ✨ 实时监听：支持页面变化、标签切换、URL 变化自动检测
- 🎨 Tooltip 样式优化：居中对齐、向下箭头、与 GitLab 原生样式一致

**性能优化：**
- ⚡ 使用 WeakSet 追踪 DOM 元素，避免重复处理
- ⚡ 防抖机制，减少不必要的扫描
- ⚡ 类型映射缓存，确保同一 tid 类型一致
- ⚡ 智能上下文分析，提高类型判断准确性

**问题修复：**
- 🐛 修复同一 tid 多个链接类型不一致的问题
- 🐛 屏蔽 GitLab 原生的 "Issue in Jira" tooltip
- 🐛 修复 commit 列表中链接无法正确识别的问题
