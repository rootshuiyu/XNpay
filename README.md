# 咪咕支付管理系统 (XiniPay)

游戏支付聚合管理系统，基于 React + Ant Design 前端和 Go (Gin) + MySQL 后端的全栈项目。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 5
- Ant Design 5
- React Router v6
- Zustand (状态管理)
- ECharts (图表)
- Axios

### 后端
- Go 1.22+
- Gin (HTTP 框架)
- GORM (ORM)
- MySQL 8.0
- JWT 认证
- WebSocket (实时通知)

## 功能模块

1. **仪表盘** - 订单统计、趋势图表、最近订单
2. **游戏渠道管理** - 渠道增删改查、启用/停用
3. **游戏账号管理** - 账号增删改查
4. **支付订单数据** - 订单统计概览
5. **订单数据查询** - 多条件搜索、详情查看、CSV导出
6. **抽佣点位记录** - 佣金记录、费率配置
7. **收银台地址** - 收银台URL生成与管理
8. **分后台管理** - 子管理员CRUD、权限分配
9. **后台配置管理** - 系统全局配置
10. **实时通知** - WebSocket 新订单推送

## 快速开始

### 前提条件
- Go 1.22+
- Node.js 18+
- MySQL 8.0

### 1. 配置数据库

创建 MySQL 数据库:

```sql
CREATE DATABASE xinipay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 修改后端配置

编辑 `backend/config.yaml`，配置数据库连接信息。

### 3. 启动后端

```bash
cd backend
go run cmd/server/main.go
```

服务启动在 http://localhost:8080

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000

### 默认管理员账号

- 用户名: `admin`
- 密码: `admin123`

## 项目结构

```
xinipay/
├── frontend/          # React 前端
│   ├── src/
│   │   ├── api/       # API 接口
│   │   ├── layouts/   # 布局组件
│   │   ├── pages/     # 页面组件
│   │   ├── store/     # 状态管理
│   │   ├── types/     # TS 类型
│   │   ├── utils/     # 工具函数
│   │   └── router/    # 路由配置
│   └── vite.config.ts
├── backend/           # Go 后端
│   ├── cmd/server/    # 入口
│   ├── internal/
│   │   ├── handler/   # HTTP 处理器
│   │   ├── middleware/# 中间件
│   │   ├── model/     # 数据模型
│   │   └── router/    # 路由注册
│   ├── pkg/           # 公共包
│   └── config.yaml    # 配置文件
└── README.md
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| POST | /api/auth/logout | 登出 |
| GET | /api/auth/profile | 用户信息 |
| GET | /api/dashboard/stats | 仪表盘统计 |
| GET | /api/dashboard/chart | 图表数据 |
| CRUD | /api/channels | 游戏渠道 |
| CRUD | /api/accounts | 游戏账号 |
| GET | /api/orders | 订单列表 |
| GET | /api/orders/export | 导出订单 |
| CRUD | /api/commissions | 抽佣记录 |
| CRUD | /api/cashiers | 收银台 |
| CRUD | /api/sub-admins | 子管理员 |
| GET/PUT | /api/configs | 系统配置 |
| WS | /api/ws/notifications | 实时通知 |
