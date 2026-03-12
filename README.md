# 犀牛支付 (XiniPay)

游戏跑分支付管理系统，支持游戏通道管理、多级商户体系、佣金分润，基于 React + Go 全栈开发。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 5 + Ant Design 5
- React Router v6 + Zustand
- ECharts + Axios

### 后端
- Go 1.26 + Gin
- GORM + PostgreSQL
- JWT + WebSocket
- RSA License 授权

## 功能模块

- **仪表盘** — 订单统计、趋势图表、实时数据
- **游戏通道管理** — 通道 CRUD、状态切换、统计卡片
- **游戏账号管理** — 4 状态生命周期、批量导入
- **订单管理** — 多条件搜索、详情、CSV 导出
- **多级商户体系** — 无限级代理、独立面板、邀请码注册
- **佣金分润** — 按层级自动分润、佣金记录
- **收银台** — H5/PC 自适应支付页面
- **系统配置** — 全局参数管理

## 代码保护

- Go garble 混淆编译 + UPX 压缩
- 前端 javascript-obfuscator 混淆
- 硬件绑定 License + RSA 签名校验
- 防调试检测 + 二进制完整性校验
- Docker 只读容器部署

## 快速开始

### 开发环境

```bash
# 后端
cd backend
go run cmd/server/main.go

# 前端
cd frontend
npm install && npm run dev
```

### Docker 部署

```bash
docker-compose up -d
```

### 默认账号

- 管理员: `admin` / `admin123`
- 商户: `merchant` / `merchant123`

## 项目结构

```
xinipay/
├── frontend/              # React 前端
├── backend/               # Go 后端
│   ├── cmd/server/        # 主程序入口
│   ├── cmd/fingerprint/   # 机器指纹工具
│   ├── cmd/license-tool/  # License 签发工具
│   └── internal/
│       ├── handler/       # HTTP 处理器
│       ├── middleware/    # JWT/CORS 中间件
│       ├── model/         # 数据模型
│       ├── license/       # 授权保护模块
│       ├── channel/       # 支付通道
│       ├── service/       # 业务服务
│       └── router/        # 路由注册
├── Dockerfile             # 多阶段构建
├── docker-compose.yml     # 生产部署编排
├── build.sh               # Linux 构建脚本
└── build.ps1              # Windows 构建脚本
```
