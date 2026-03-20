import { Card, Descriptions } from 'antd';
import { changeMerchantPassword } from '../../api/merchant';
import useMerchantStore from '../../store/useMerchantStore';
import ChangePasswordCard from '../../components/ChangePasswordCard';

export default function MerchantSettings() {
  const { merchant } = useMerchantStore();

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h2>个人设置</h2>
        <p>管理账户信息和修改密码</p>
      </div>
      <Card title="账户信息" style={{ marginBottom: 24 }}>
        <Descriptions column={1}>
          <Descriptions.Item label="用户名">{merchant?.username}</Descriptions.Item>
          <Descriptions.Item label="昵称">{merchant?.nickname}</Descriptions.Item>
          <Descriptions.Item label="层级">Lv.{merchant?.level}</Descriptions.Item>
          <Descriptions.Item label="费率">{((merchant?.fee_rate || 0) * 100).toFixed(2)}%</Descriptions.Item>
          <Descriptions.Item label="邀请码">{merchant?.invite_code}</Descriptions.Item>
        </Descriptions>
      </Card>

      <ChangePasswordCard onSubmit={changeMerchantPassword} />
    </div>
  );
}
