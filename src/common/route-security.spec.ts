import 'reflect-metadata';
import { Type } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CatalogController } from '../catalog/catalog.controller';
import { DispatchController } from '../dispatch/dispatch.controller';
import { PartnerController } from '../dispatch/partner.controller';
import { HealthController } from '../health/health.controller';
import { AdminUsersController } from '../identity/admin-users.controller';
import { AuthController } from '../identity/auth.controller';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { MeController } from '../identity/me.controller';
import { ROLES_KEY, RolesGuard } from '../identity/roles.guard';
import { MerchantOrdersController } from '../orders/merchant-orders.controller';
import { OrderAdminController } from '../orders/order-admin.controller';
import { OrderStatusController } from '../orders/order-status.controller';
import { OrdersController } from '../orders/orders.controller';
import { PartnerOrdersController } from '../orders/partner-orders.controller';

// नया Controller बनाओ तो इस सूची में जोड़ना ज़रूरी है।
const CONTROLLERS: Type<unknown>[] = [
  HealthController,
  AuthController,
  MeController,
  AdminUsersController,
  CatalogController,
  OrdersController,
  OrderStatusController,
  OrderAdminController,
  MerchantOrdersController,
  PartnerOrdersController,
  DispatchController,
  PartnerController,
];

// जानबूझकर खुले रास्ते: हर एक का यहाँ नाम लिखना ज़रूरी है।
const PUBLIC = new Set([
  'HealthController.check',
  'AuthController.requestOtp',
  'AuthController.verifyOtp',
  'AuthController.refresh',
  'AuthController.logout',
  'CatalogController.list',
]);

// Login ज़रूरी, पर कोई भी Role चलेगा
const ANY_ROLE = new Set(['MeController.me']);

interface Route {
  id: string;
  controller: string;
  fullPath: string;
  guards: unknown[];
  roles: string[] | undefined;
}

const routes: Route[] = CONTROLLERS.flatMap((controller) => {
  const classPath = String(
    Reflect.getMetadata(PATH_METADATA, controller) ?? '',
  );
  return Object.getOwnPropertyNames(controller.prototype)
    .filter(
      (name) =>
        name !== 'constructor' &&
        typeof controller.prototype[name] === 'function',
    )
    .filter(
      (name) =>
        Reflect.getMetadata(PATH_METADATA, controller.prototype[name]) !==
        undefined,
    )
    .map((name) => {
      const handler = controller.prototype[name];
      const methodPath = String(Reflect.getMetadata(PATH_METADATA, handler));
      const guards: unknown[] = [
        ...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []),
        ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
      ];
      const roles: string[] | undefined =
        Reflect.getMetadata(ROLES_KEY, handler) ??
        Reflect.getMetadata(ROLES_KEY, controller);
      return {
        id: `${controller.name}.${name}`,
        controller: controller.name,
        fullPath: `${classPath}/${methodPath}`,
        guards,
        roles,
      };
    });
});

describe('Route security', () => {
  it('finds the routes it is supposed to check', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it('locks every route that is not on the public list', () => {
    const open = routes
      .filter((r) => !PUBLIC.has(r.id))
      .filter((r) => !r.guards.includes(JwtAuthGuard))
      .map((r) => r.id);
    expect(open).toEqual([]);
  });

  it('requires a role on every logged-in route', () => {
    const missing = routes
      .filter((r) => r.guards.includes(JwtAuthGuard) && !ANY_ROLE.has(r.id))
      .filter(
        (r) =>
          !r.guards.includes(RolesGuard) || !r.roles || r.roles.length === 0,
      )
      .map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('allows only the ADMIN role on admin paths', () => {
    const wrong = routes
      .filter((r) => r.fullPath.includes('admin'))
      .filter(
        (r) => !r.roles || r.roles.length !== 1 || r.roles[0] !== 'ADMIN',
      )
      .map((r) => r.id);
    expect(wrong).toEqual([]);
  });

  it('has no route protected by a shared key', () => {
    const usingKey = routes
      .filter((r) =>
        r.guards.some(
          (g) => (g as { name?: string }).name === 'AdminKeyGuard',
        ),
      )
      .map((r) => r.id);
    expect(usingKey).toEqual([]);
  });

  it('keeps merchant paths for MERCHANT and partner paths for PARTNER', () => {
    const wrong = routes
      .filter(
        (r) =>
          r.fullPath.includes('v1/merchant') ||
          r.fullPath.includes('v1/partner'),
      )
      .filter((r) => {
        const expected = r.fullPath.includes('v1/merchant')
          ? 'MERCHANT'
          : 'PARTNER';
        return !r.roles || r.roles.length !== 1 || r.roles[0] !== expected;
      })
      .map((r) => r.id);
    expect(wrong).toEqual([]);
  });
});
