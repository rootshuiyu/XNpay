import { useEffect, useState } from 'react';
import { Card, Select, Table, Tabs, Tag } from 'antd';
import { getLoginLogs, getOperationLogs } from '../../api/logs';
import type { LoginLog, OperationLog } from '../../types';

export default function OperationLogsPage() {
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [operationTotal, setOperationTotal] = useState(0);
  const [loginTotal, setLoginTotal] = useState(0);
  const [operationPage, setOperationPage] = useState(1);
  const [loginPage, setLoginPage] = useState(1);
  const [actorType, setActorType] = useState<string>('');
  const [loginType, setLoginType] = useState<string>('');
  const [operationLoading, setOperationLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const loadOperations = async (page = operationPage, type = actorType) => {
    setOperationLoading(true);
    try {
      const res: any = await getOperationLogs({ page, size: 15, actor_type: type || undefined });
      setOperationLogs(res.data.list || []);
      setOperationTotal(res.data.total || 0);
    } finally {
      setOperationLoading(false);
    }
  };

  const loadLogins = async (page = loginPage, type = loginType) => {
    setLoginLoading(true);
    try {
      const res: any = await getLoginLogs({ page, size: 15, actor_type: type || undefined });
      setLoginLogs(res.data.list || []);
      setLoginTotal(res.data.total || 0);
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => { loadOperations(1, actorType); }, [actorType]);
  useEffect(() => { loadLogins(1, loginType); }, [loginType]);

  const operationColumns = [
    { title: '操作人', render: (_: any, record: OperationLog) => `${record.actor_name || '-'} (${record.actor_type})` },
    { title: '动作', dataIndex: 'action', render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: '资源', render: (_: any, record: OperationLog) => `${record.resource} / ${record.resource_id}` },
    { title: 'IP', dataIndex: 'ip' },
    { title: '时间', dataIndex: 'created_at', render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ];

  const loginColumns = [
    { title: '账号', dataIndex: 'username' },
    { title: '身份', dataIndex: 'actor_type', render: (v: string) => <Tag>{v}</Tag> },
    { title: '结果', dataIndex: 'success', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '成功' : '失败'}</Tag> },
    { title: '原因', dataIndex: 'reason', render: (v: string) => v || '-' },
    { title: 'IP', dataIndex: 'ip' },
    { title: '时间', dataIndex: 'created_at', render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>操作日志</h2>
        <p>查看后台关键操作和登录行为，便于审计追踪</p>
      </div>

      <Card className="content-card">
        <Tabs
          items={[
            {
              key: 'operations',
              label: '操作日志',
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Select
                      style={{ width: 180 }}
                      placeholder="筛选身份"
                      allowClear
                      value={actorType || undefined}
                      onChange={(value) => setActorType(value || '')}
                      options={[
                        { value: 'admin', label: '管理员' },
                        { value: 'merchant', label: '商户' },
                      ]}
                    />
                  </div>
                  <Table
                    rowKey="id"
                    columns={operationColumns}
                    dataSource={operationLogs}
                    loading={operationLoading}
                    pagination={{ current: operationPage, total: operationTotal, pageSize: 15, onChange: (page) => { setOperationPage(page); loadOperations(page); } }}
                  />
                </>
              ),
            },
            {
              key: 'logins',
              label: '登录日志',
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Select
                      style={{ width: 180 }}
                      placeholder="筛选身份"
                      allowClear
                      value={loginType || undefined}
                      onChange={(value) => setLoginType(value || '')}
                      options={[
                        { value: 'admin', label: '管理员' },
                        { value: 'merchant', label: '商户' },
                      ]}
                    />
                  </div>
                  <Table
                    rowKey="id"
                    columns={loginColumns}
                    dataSource={loginLogs}
                    loading={loginLoading}
                    pagination={{ current: loginPage, total: loginTotal, pageSize: 15, onChange: (page) => { setLoginPage(page); loadLogins(page); } }}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
