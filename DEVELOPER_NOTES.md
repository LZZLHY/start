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

### 推送新版本到 GitHub 时：

1. **修改 package.json 版本号**
   - 根目录 `package.json`
   - `backend/package.json`
   - `frontend/package.json`
   - 三个文件的版本号必须保持一致

2. **提交并打 tag**
   ```bash
   git add -A
   git commit -m "v1.0.x"
   git tag v1.0.x
   git push origin main
   git push origin v1.0.x
   ```

3. **版本号用途**
   - 后台更新检测从根目录 `package.json` 读取当前版本
   - GitHub API 获取最新 tag 作为最新版本
   - 两者比较判断是否有更新

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

## Git 提交规范

- **小提交标题简短而概括**，不要写太长
- 示例：`fix: 修复登录问题`、`feat: 添加账户管理`、`v1.0.3`
- 不要自动提交，等用户确认改动没问题后再提交
- 不轻易推送 GitHub，用户会明确说明何时推送

---

## 开发者文档 (DEVLOG.md) 规范

- **不得随便修改**，需征得用户同意才能写入
- 只有在功能确认完成后才记录
- 时间格式：详细北京时间如 `2026-01-15 01:14:52`
- **此文件已在 `.gitignore` 中，不上传 Git 和 GitHub**
