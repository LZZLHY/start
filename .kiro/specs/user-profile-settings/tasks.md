# Implementation Plan: User Profile Settings

## Overview

实现用户个人资料设置功能，包括后端 API 和前端设置页面。

## Tasks

- [x] 1. 后端：实现用户资料更新 API
  - [x] 1.1 在 `userController.ts` 添加 `updateMyProfile` 函数
    - 验证 schema：username (3-32), nickname (2-32), email (valid format or null), phone (6-32 or null)
    - 处理唯一约束冲突错误
    - _Requirements: 2.1, 3.1, 4.1, 4.4, 5.1, 5.4_
  - [x] 1.2 在 `users.ts` 路由添加 `PATCH /me/profile` 端点
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 2. 后端：实现密码修改 API
  - [x] 2.1 在 `userController.ts` 添加 `changeMyPassword` 函数
    - 验证当前密码
    - 验证新密码 (6-200 chars)
    - 更新密码哈希
    - _Requirements: 6.1, 6.2_
  - [x] 2.2 在 `users.ts` 路由添加 `PATCH /me/password` 端点
    - _Requirements: 6.1_

- [x] 3. 前端：扩展 auth store
  - [x] 3.1 在 `auth.ts` 添加 `updateProfile` 方法
    - 调用 `/api/users/me/profile` API
    - 更新本地 user 状态
    - _Requirements: 2.1, 3.1, 4.1, 5.1_
  - [x] 3.2 在 `auth.ts` 添加 `changePassword` 方法
    - 调用 `/api/users/me/password` API
    - _Requirements: 6.1_

- [x] 4. 前端：创建设置页面
  - [x] 4.1 创建 `frontend/src/pages/Settings/index.tsx`
    - 显示当前用户信息
    - 包含资料编辑表单和密码修改表单
    - 未登录时重定向到登录页
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 4.2 在 `App.tsx` 添加 `/settings` 路由
    - _Requirements: 1.1_

- [x] 5. 前端：实现表单验证和反馈
  - [x] 5.1 实现资料表单验证
    - 用户名 3-32 字符
    - 昵称 2-32 字符
    - 邮箱格式验证
    - 手机号 6-32 字符
    - _Requirements: 2.3, 3.3, 4.3, 5.3, 7.4_
  - [x] 5.2 实现密码表单验证
    - 新密码 6-200 字符
    - 确认密码匹配
    - _Requirements: 6.3, 6.4, 7.4_
  - [x] 5.3 实现成功/失败提示
    - 使用 toast 显示操作结果
    - _Requirements: 7.1, 7.2_

- [x] 6. Checkpoint - 功能测试
  - 确保所有功能正常工作，询问用户是否有问题

- [x] 7. 测试
  - [x] 7.1 后端 API 单元测试
    - 测试资料更新验证
    - 测试密码修改验证
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 6.1_
  - [x] 7.2 Property 1: Valid Profile Update
    - **Property 1: Valid Profile Update Preserves User Identity**
    - **Validates: Requirements 2.1, 3.1, 4.1, 5.1**
  - [x] 7.3 Property 2: Invalid Input Rejection
    - **Property 2: Invalid Input Rejection**
    - **Validates: Requirements 2.3, 3.3, 4.3, 5.3, 6.3**

## Notes

- 密码修改需要验证当前密码，防止未授权修改
- 邮箱和手机号可以设置为空（null）
- 所有唯一字段（username, nickname, email, phone）需要处理冲突错误
