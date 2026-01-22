# 开发者备忘录

## 新增设置项时的维护清单

当在 `frontend/src/stores/appearance.ts` 或 `frontend/src/stores/bookmarkDnd.ts` 中添加新的设置项时，需要同步更新以下位置：

### 1. 设置导出/导入 (`frontend/src/utils/settingsFile.ts`)

#### 对于 Appearance 设置项：
1. **在 `APPEARANCE_KEYS` 数组中添加新的 key 名称**
   - 位置：文件顶部的 `APPEARANCE_KEYS` 常量数组
   - 这样 `createSettingsFile()` 会自动包含该字段到导出文件中

2. **在 `applySettingsFile()` 函数中添加解析逻辑**
   - 需要手动添加验证和应用逻辑
   - 参考现有字段的处理方式（如 `searchGlowBorder`）

#### 对于 BookmarkDnd 设置项：
1. 在 `createSettingsFile()` 的 `bookmarkDnd` 对象中添加字段
2. 在 `applySettingsFile()` 的 bookmarkDnd 处理部分添加解析逻辑

### 2. Store 本身 (`frontend/src/stores/appearance.ts`)

确保新字段已添加到：
- `AppearanceState` 类型定义
- `DEFAULTS` 常量
- `persist` 的 `partialize` 函数中

---

## 设计说明

当前的设置保存机制：
- **导出**：点击保存按钮时，`createSettingsFile()` 会从 store 读取所有 `APPEARANCE_KEYS` 中定义的字段，生成完整的设置文件覆盖旧文件
- **导入**：`applySettingsFile()` 会解析文件中的每个字段，验证后应用到 store

这种设计确保：
1. 导出的文件总是包含所有当前设置项
2. 导入时可以兼容旧版本文件（缺少的字段会保留当前值）
3. 新增设置项只需在 `APPEARANCE_KEYS` 添加 key，导出会自动包含


---

## 版本发布流程

### 版本号体系

项目使用 **大版本号 + 补丁号** 的双重版本管理：

- **大版本号**（如 `1.1.1`）：通过 Git tag 管理，用于重大功能更新
- **补丁号**（如 `10067`）：用于同一大版本下的紧急修复，无需新建 tag

### 显示格式

- **前端用户界面**：`v1.1.1 (#10067)`
- **后台更新页面**：`v1.1.1 (10067)`
- **package.json**：`"version": "1.1.1"` + `"patchVersion": 10067`

### 推送新版本到 GitHub 时：

1. **修改 package.json 版本号和补丁号**
   - 根目录 `package.json`
   - `backend/package.json`
   - `frontend/package.json`
   - `shared/package.json`
   - 四个文件的 `version` 和 `patchVersion` 必须保持一致

2. **版本号格式规范（重要！）**
   - **package.json 中的版本号：不带 `v` 前缀**，如 `"version": "1.1.1"`
   - **Git tag：带 `v` 前缀**，如 `v1.1.1`
   - **Git commit message：不带 `v` 前缀**，如 `1.1.1`
   - 示例：
     - ✅ package.json: `"version": "1.1.1"`, `"patchVersion": 10067`
     - ✅ git tag: `v1.1.1`
     - ✅ commit message: `1.1.1`
     - ❌ package.json: `"version": "v1.1.1"` （错误！）

3. **提交并打 tag（新大版本）**
   ```bash
   git add -A
   git commit -m "1.1.1"
   git tag v1.1.1
   git push origin main
   git push origin v1.1.1
   ```

4. **紧急补丁更新（同一大版本）**
   - 只需修改 `patchVersion`，无需新建 tag
   - 提交并推送即可，部署端会检测到补丁更新
   ```bash
   git add -A
   git commit -m "fix: 修复xxx问题"
   git tag -d v1.1.1           # 删除本地旧 tag
   git tag v1.1.1              # 重新创建 tag 指向新 commit
   git push origin main
   git push origin v1.1.1 --force  # 强制更新远程 tag
   ```

5. **版本号用途**
   - 后台更新检测从根目录 `package.json` 读取当前版本和补丁号
   - GitHub API 获取最新 tag 对应的 package.json 中的版本和补丁号
   - 比较逻辑：先比较大版本号，相同则比较补丁号

6. **更新 changelog.json**
   - 每次发布都要更新 `frontend/public/changelog.json`
   - 格式：`"version": "1.1.1", "patch": 10067`

---

## 数据库迁移说明

### 自动迁移机制

项目已配置自动数据库迁移，部署用户更新时无需手动操作：

1. **开发环境** (`npm run dev`)
   - `predev` 钩子自动执行 `db:prepare`
   - 包含：`prisma migrate deploy` → `prisma generate` → `prisma db seed`

2. **生产环境** (`npm start`)
   - `prestart` 钩子同样自动执行 `db:prepare`

### 新增数据库表时的流程

1. 修改 `backend/prisma/schema.prisma`
2. 运行 `npm run prisma:migrate` 生成迁移文件
3. 迁移文件会保存在 `backend/prisma/migrations/` 目录
4. 提交迁移文件到 Git
5. 部署用户拉取代码后，启动时会自动应用迁移

### 当前数据库表

- `User` - 用户表
- `Bookmark` - 书签表
- `UserSettings` - 用户设置表
- `AuditLog` - 审计日志表
- `ClickStat` - 点击统计表 (v1.0.3+)

---

## Git 分支策略

项目使用 **双分支工作流**，确保 GitHub 历史干净：

| 分支 | 用途 | 推送到 GitHub |
|------|------|---------------|
| `dev` | 日常开发，保留所有小 commit | ❌ 不推送 |
| `main` | 发布版本，只有版本号 commit | ✅ 推送 |

### 日常开发流程

```bash
# 1. 切换到 dev 分支开发
git checkout dev

# 2. 随意提交小修改（本地保留）
git add -A
git commit -m "fix: 修复xxx问题"
git commit -m "feat: 添加xxx功能"
# ... 可以有多个 commit
```

### 发布新版本流程

```bash
# 1. 更新版本文件
#    - 4 个 package.json 的 version 和 patchVersion
#    - frontend/public/changelog.json
#    - DEVLOG.md

# 2. 在 dev 分支提交版本更新
git add -A
git commit -m "chore: bump version to x.x.x"

# 3. 切换到 main 分支，squash merge
git checkout main
git merge --squash dev

# 4. 提交（只有一个版本号 commit）
git commit -m "x.x.x"

# 5. 打 tag 并推送
git tag vx.x.x
git push origin main
git push origin vx.x.x

# 6. 切回 dev 继续开发
git checkout dev
```

### 紧急补丁（同版本修复）

```bash
# 在 dev 分支修复并提交
git checkout dev
git commit -m "fix: 紧急修复xxx"

# squash merge 到 main
git checkout main
git merge --squash dev
git commit -m "x.x.x"

# 更新 tag 并强制推送
git tag -d vx.x.x
git tag vx.x.x
git push origin main
git push origin vx.x.x --force

git checkout dev
```

---

## Git 提交规范

- **小提交标题简短而概括**，不要写太长
- 示例：`fix: 修复登录问题`、`feat: 添加账户管理`
- 不要自动提交，等用户确认改动没问题后再提交
- 不轻易推送 GitHub，用户会明确说明何时推送
- **main 分支的 commit message 只能是版本号**（如 `1.4.0`）

---

## 开发者文档 (DEVLOG.md) 规范

- **不得随便修改**，需征得用户同意才能写入
- 只有在功能确认完成后才记录
- 时间格式：详细北京时间如 `2026-01-15 01:14:52`
- **此文件已在 `.gitignore` 中，不上传 Git 和 GitHub**

---

## CI/CD 注意事项（v1.2.1 热修复经验）

### Vitest vs Jest

- 本项目使用 **Vitest**，不是 Jest
- Vitest 命令语法：`npx vitest run <path>` 或 `--config <file>`
- **错误示例**：`--testPathPattern` 是 Jest 语法，Vitest 不支持

### 集成测试配置

- 单元测试配置：`backend/vitest.config.ts`（排除集成测试）
- 集成测试配置：`backend/vitest.integration.config.ts`（专用）
- CI 中需要传递 `DATABASE_URL` 环境变量

### 依赖同步

- 修改 `package.json` 后必须运行 `npm install` 更新 `package-lock.json`
- CI 使用 `npm ci`，要求 lock 文件与 package.json 完全同步

### 安装脚本维护

`scripts/install.sh` 修改时必须确保：

- [ ] 包含 `npm run build:shared` 步骤（第 6/10 步）
- [ ] 步骤编号正确（当前 10 步）
- [ ] 在真实 Linux 环境测试

### TypeScript 严格模式

- 禁止使用 `any` 类型（使用 `unknown` 或具体类型）
- `res.json()` 返回 `unknown`，需要类型断言
- React Hooks 必须在组件顶层调用（不能在 early return 之后）

### 测试用例要求

- 集成测试必须与实际 API 行为匹配
- 不存在的端点应该 `describe.skip` 跳过
- Prisma mock 可能需要 `as any` 绕过类型检查

---

## 发布检查清单

发布新版本前，确认以下事项：

- [ ] 本地运行 `npm run lint` 通过
- [ ] 本地运行 `npm test` 通过（frontend 和 backend）
- [ ] 本地运行 `npm run build` 通过（frontend 和 backend）
- [ ] CI 所有 Job 通过
- [ ] 在 Linux 环境测试 `install.sh` 脚本
- [ ] 更新版本号（package.json 中的 version 和 patchVersion）
- [ ] 创建 Git tag

---

## 常见问题排查

### Q: 后端启动报错 "Cannot find module '@start/shared'"
**A**: 运行 `npm run build:shared`

### Q: CI 报错 "npm ci" 失败
**A**: 本地运行 `npm install` 重新生成 lock 文件

### Q: 集成测试找不到测试文件
**A**: 检查 `vitest.config.ts` 的 `exclude` 配置

### Q: Linux 安装脚本卡住
**A**: 查看后端日志：`cd ~/start/backend && npm run dev`

---

## 关键文件路径

| 用途 | 路径 |
|------|------|
| CI 工作流 | `.github/workflows/ci.yml` |
| 安装脚本 | `scripts/install.sh` |
| 卸载脚本 | `scripts/uninstall.sh` |
| 后端测试配置 | `backend/vitest.config.ts` |
| 集成测试配置 | `backend/vitest.integration.config.ts` |
| 共享模块入口 | `shared/src/index.ts` |
