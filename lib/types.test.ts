import { describe, it, expect } from 'vitest'
import type {
  LoginSuccessResponse,
  LoginFailureResponse,
  LoginResponse,
  LogoutRequest,
  LogoutResult,
  PermissionAccess,
  Permissions,
  UserProfile
} from './types'

describe('types', () => {
  describe('LoginSuccessResponse', () => {
    it('should match the expected shape', () => {
      const response: LoginSuccessResponse = {
        success: true,
        accessToken: 'test-access-token',
        idToken: 'test-id-token'
      }

      expect(response.success).toBe(true)
      expect(typeof response.accessToken).toBe('string')
      expect(typeof response.idToken).toBe('string')
    })
  })

  describe('LoginFailureResponse', () => {
    it('should match the expected shape', () => {
      const response: LoginFailureResponse = {
        success: false,
        errorMessage: 'Login failed'
      }

      expect(response.success).toBe(false)
      expect(typeof response.errorMessage).toBe('string')
    })
  })

  describe('LoginResponse', () => {
    it('should accept LoginSuccessResponse', () => {
      const successResponse: LoginResponse = {
        success: true,
        accessToken: 'token',
        idToken: 'id-token'
      }

      expect(successResponse.success).toBe(true)
    })

    it('should accept LoginFailureResponse', () => {
      const failureResponse: LoginResponse = {
        success: false,
        errorMessage: 'Error occurred'
      }

      expect(failureResponse.success).toBe(false)
    })
  })

  describe('LogoutRequest', () => {
    it('should match the expected shape', () => {
      const request: LogoutRequest = {
        revokeToken: true
      }

      expect(typeof request.revokeToken).toBe('boolean')
    })
  })

  describe('LogoutResult', () => {
    it('should match the expected shape', () => {
      const result: LogoutResult = {
        success: true
      }

      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('PermissionAccess', () => {
    it('should match the expected shape', () => {
      const permission: PermissionAccess = {
        permissionKey: 'read:users',
        orgCode: 'org_123',
        isGranted: true
      }

      expect(typeof permission.permissionKey).toBe('string')
      expect(typeof permission.orgCode).toBe('string')
      expect(typeof permission.isGranted).toBe('boolean')
    })

    it('should allow null orgCode', () => {
      const permission: PermissionAccess = {
        permissionKey: 'read:users',
        orgCode: null,
        isGranted: false
      }

      expect(permission.orgCode).toBeNull()
    })
  })

  describe('Permissions', () => {
    it('should match the expected shape', () => {
      const permissions: Permissions = {
        orgCode: 'org_123',
        permissions: ['read:users', 'write:users']
      }

      expect(typeof permissions.orgCode).toBe('string')
      expect(Array.isArray(permissions.permissions)).toBe(true)
      expect(permissions.permissions.every(p => typeof p === 'string')).toBe(true)
    })

    it('should allow null orgCode', () => {
      const permissions: Permissions = {
        orgCode: null,
        permissions: ['global:permission']
      }

      expect(permissions.orgCode).toBeNull()
    })
  })

  describe('UserProfile', () => {
    it('should match the expected shape', () => {
      const user: UserProfile = {
        id: 'user_123',
        givenName: 'John',
        familyName: 'Doe',
        email: 'john.doe@example.com',
        picture: 'https://example.com/avatar.jpg'
      }

      expect(typeof user.id).toBe('string')
      expect(typeof user.givenName).toBe('string')
      expect(typeof user.familyName).toBe('string')
      expect(typeof user.email).toBe('string')
      expect(typeof user.picture).toBe('string')
    })
  })
})