import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types';

interface PermissionConfig {
    canCheckIn: boolean;
    canCheckOut: boolean;
    canCreateReservation: boolean;
    canCancelReservation: boolean;
    canViewFinances: boolean;
    canRecordExpenses: boolean;
    canManageInventory: boolean;
    canManageSettings: boolean;
    canManageUsers: boolean;
    canUpdateRoomStatus: boolean;
    canEditRoomRates: boolean;
    canManageServices: boolean;
}

const rolePermissions: Record<UserRole, PermissionConfig> = {
    admin: {
        canCheckIn: true,
        canCheckOut: true,
        canCreateReservation: true,
        canCancelReservation: true,
        canViewFinances: true,
        canRecordExpenses: true,
        canManageInventory: true,
        canManageSettings: true,
        canManageUsers: true,
        canUpdateRoomStatus: true,
        canEditRoomRates: true,
        canManageServices: true,
    },
    manager: {
        canCheckIn: true,
        canCheckOut: true,
        canCreateReservation: true,
        canCancelReservation: true,
        canViewFinances: true,
        canRecordExpenses: false,
        canManageInventory: true,
        canManageSettings: false,
        canManageUsers: false,
        canUpdateRoomStatus: true,
        canEditRoomRates: true,
        canManageServices: true,
    },
    reception: {
        canCheckIn: true,
        canCheckOut: true,
        canCreateReservation: true,
        canCancelReservation: false,
        canViewFinances: false,
        canRecordExpenses: false,
        canManageInventory: false,
        canManageSettings: false,
        canManageUsers: false,
        canUpdateRoomStatus: true,
        canEditRoomRates: false,
        canManageServices: false,
    },
    housekeeping: {
        canCheckIn: false,
        canCheckOut: false,
        canCreateReservation: false,
        canCancelReservation: false,
        canViewFinances: false,
        canRecordExpenses: false,
        canManageInventory: false,
        canManageSettings: false,
        canManageUsers: false,
        canUpdateRoomStatus: true,
        canEditRoomRates: false,
        canManageServices: false,
    },
    accountant: {
        canCheckIn: false,
        canCheckOut: false,
        canCreateReservation: false,
        canCancelReservation: false,
        canViewFinances: true,
        canRecordExpenses: true,
        canManageInventory: false,
        canManageSettings: false,
        canManageUsers: false,
        canUpdateRoomStatus: false,
        canEditRoomRates: false,
        canManageServices: false,
    },
    back_desk: {
        canCheckIn: false,
        canCheckOut: false,
        canCreateReservation: false,
        canCancelReservation: false,
        canViewFinances: false,
        canRecordExpenses: false,
        canManageInventory: false,
        canManageSettings: false,
        canManageUsers: false,
        canUpdateRoomStatus: false,
        canEditRoomRates: false,
        canManageServices: true,
    },
};

export function usePermissions(): PermissionConfig {
    const user = useAuthStore((state) => state.user);

    if (!user) {
        return {
            canCheckIn: false,
            canCheckOut: false,
            canCreateReservation: false,
            canCancelReservation: false,
            canViewFinances: false,
            canRecordExpenses: false,
            canManageInventory: false,
            canManageSettings: false,
            canManageUsers: false,
            canUpdateRoomStatus: false,
            canEditRoomRates: false,
            canManageServices: false,
        };
    }

    return rolePermissions[user.role];
}

export function useIsAdmin(): boolean {
    const user = useAuthStore((state) => state.user);
    return user?.role === 'admin';
}

export function useHasRole(roles: UserRole[]): boolean {
    const user = useAuthStore((state) => state.user);
    return user ? roles.includes(user.role) : false;
}
