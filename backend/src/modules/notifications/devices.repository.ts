import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import type { DeliveryActor } from '../deliveries/delivery.types';
import type { RegisterDevice, RevokeDevice } from './notifications.schemas';

const hash = (key: string) => createHash('sha256').update(key).digest('hex');
export const devicesRepository = {
  async register(actor: DeliveryActor, input: RegisterDevice) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [users] = await conn.query<RowDataPacket[]>('SELECT role,active FROM users WHERE id = ? FOR SHARE', [
        actor.id,
      ]);
      if (!users[0]?.active || users[0].role !== actor.role || !['CUSTOMER', 'COURIER'].includes(actor.role))
        throw new AppError('Conta sem permissão para notificações.', 403);
      const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM push_devices WHERE id = ? FOR UPDATE', [
        input.installationId,
      ]);
      const previous = rows[0];
      if (
        previous &&
        (previous.secret_hash !== hash(input.installationKey) ||
          input.bindingVersion < Number(previous.binding_version))
      )
        throw new AppError('Registro de dispositivo incompatível.', 409);
      if (previous && input.bindingVersion === Number(previous.binding_version)) {
        if (
          !previous.active ||
          previous.user_id !== actor.id ||
          previous.token !== input.token ||
          previous.platform !== input.platform
        )
          throw new AppError('Vínculo de dispositivo desatualizado.', 409);
      } else {
        if (previous)
          await conn.query(
            `UPDATE push_devices SET user_id=?,token=?,platform=?,binding_version=?,active=1,
          bound_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
            [actor.id, input.token, input.platform, input.bindingVersion, input.installationId],
          );
        else
          await conn.query(
            `INSERT INTO push_devices (id,secret_hash,user_id,token,platform,binding_version) VALUES (?,?,?,?,?,?)`,
            [
              input.installationId,
              hash(input.installationKey),
              actor.id,
              input.token,
              input.platform,
              input.bindingVersion,
            ],
          );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new AppError('Token já vinculado a outra instalação.', 409);
      throw error;
    } finally {
      conn.release();
    }
  },
  async revoke(input: RevokeDevice) {
    // Capacidade de revogação: não exige a sessão antiga e não revela se o dispositivo existe.
    // Tombstone também cobre uma revogação que chega ANTES do primeiro registro em trânsito.
    await db.query(
      `INSERT INTO push_devices (id,secret_hash,binding_version,active) VALUES (?,?,?,0)
      ON DUPLICATE KEY UPDATE active=IF(secret_hash=VALUES(secret_hash) AND binding_version<=VALUES(binding_version),0,active),
      binding_version=IF(secret_hash=VALUES(secret_hash),GREATEST(binding_version,VALUES(binding_version)),binding_version),updated_at=UTC_TIMESTAMP(3)`,
      [input.installationId, hash(input.installationKey), input.bindingVersion],
    );
  },
};
