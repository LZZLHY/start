# Design Document: User Profile Settings

## Overview

用户个人资料设置功能允许已登录用户修改自己的账号信息。该功能包括前端设置页面和后端API两部分。

前端：新增 `/settings` 路由，展示用户当前信息并提供编辑表单。
后端：扩展 `/api/users/me` 路由，支持更新用户名、邮箱、手机号，新增密码修改接口。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Settings Page (/settings)               │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ Profile Form│  │Password Form│  │  User Info  │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  PATCH /api/users/me/profile  - 更新用户资料         │    │
│  │  PATCH /api/users/me/password - 修改密码             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend API

#### 1. Update Profile API

**Endpoint:** `PATCH /api/users/me/profile`

**Request Body:**
```typescript
{
  username?: string    // 3-32 characters
  nickname?: string    // 2-32 characters
  email?: string | null
  phone?: string | null
}
```

**Response (200):**
```typescript
{
  ok: true,
  data: {
    user: {
      id: string
      username: string
      email: string | null
      phone: string | null
      nickname: string
      role: 'USER' | 'ADMIN' | 'ROOT'
      createdAt: string
    }
  }
}
```

**Error Responses:**
- 400: 参数错误（验证失败）
- 401: 未登录
- 409: 账号/邮箱/手机号/昵称已被占用

#### 2. Change Password API

**Endpoint:** `PATCH /api/users/me/password`

**Request Body:**
```typescript
{
  currentPassword: string
  newPassword: string  // 6-200 characters
}
```

**Response (200):**
```typescript
{
  ok: true,
  data: { message: '密码修改成功' }
}
```

**Error Responses:**
- 400: 参数错误
- 401: 未登录或当前密码错误

### Frontend Components

#### 1. SettingsPage

主设置页面组件，包含用户信息展示和编辑表单。

```typescript
// frontend/src/pages/Settings/index.tsx
export function SettingsPage(): JSX.Element
```

#### 2. ProfileForm

用户资料编辑表单，包含用户名、昵称、邮箱、手机号字段。

```typescript
interface ProfileFormProps {
  user: User
  onSuccess: () => void
}
```

#### 3. PasswordForm

密码修改表单，包含当前密码、新密码、确认密码字段。

```typescript
interface PasswordFormProps {
  onSuccess: () => void
}
```

### Auth Store Extensions

扩展 `useAuthStore` 添加新的更新方法：

```typescript
// 新增方法
updateProfile: (data: {
  username?: string
  nickname?: string
  email?: string | null
  phone?: string | null
}) => Promise<{ ok: true } | { ok: false; message: string }>

changePassword: (currentPassword: string, newPassword: string) => 
  Promise<{ ok: true } | { ok: false; message: string }>
```

## Data Models

使用现有的 User 模型，无需修改数据库 schema。

```typescript
type User = {
  id: string
  username: string
  email: string | null
  phone: string | null
  nickname: string
  role: 'USER' | 'ADMIN' | 'ROOT'
  createdAt: string
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid Profile Update Preserves User Identity

*For any* valid profile update request (username 3-32 chars, nickname 2-32 chars, valid email format, phone 6-32 chars), the API SHALL return the updated user with the same user ID and the new field values.

**Validates: Requirements 2.1, 3.1, 4.1, 5.1**

### Property 2: Invalid Input Rejection

*For any* profile update request with invalid field values (username < 3 or > 32 chars, nickname < 2 or > 32 chars, invalid email format, phone < 6 or > 32 chars, password < 6 or > 200 chars), the API SHALL return a 400 error.

**Validates: Requirements 2.3, 3.3, 4.3, 5.3, 6.3**

### Property 3: Password Change with Verification

*For any* password change request with correct current password and valid new password (6-200 chars), the API SHALL successfully update the password, and subsequent login with the new password SHALL succeed.

**Validates: Requirements 6.1**

## Error Handling

| Error Case | HTTP Status | Message |
|------------|-------------|---------|
| 未登录 | 401 | 未登录 |
| 参数验证失败 | 400 | 具体验证错误信息 |
| 当前密码错误 | 401 | 当前密码错误 |
| 唯一约束冲突 | 409 | 账号/邮箱/手机号/昵称已被占用 |
| 服务器错误 | 500 | 更新失败 |

## Testing Strategy

### Unit Tests

1. **API 验证测试**
   - 测试各字段的边界值验证
   - 测试空值和 null 值处理
   - 测试唯一约束冲突错误

2. **前端表单测试**
   - 测试表单验证逻辑
   - 测试提交状态管理

### Property-Based Tests

使用 vitest 进行属性测试：

1. **Property 1**: 生成随机有效的用户资料数据，验证更新成功
2. **Property 2**: 生成随机无效的输入数据，验证被拒绝
3. **Property 3**: 生成随机密码，验证密码修改和登录流程

配置：每个属性测试运行 100 次迭代。
