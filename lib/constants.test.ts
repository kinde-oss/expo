import { describe, it, expect } from 'vitest'
import { DEFAULT_TOKEN_SCOPES } from './constants'

describe('constants', () => {
  describe('DEFAULT_TOKEN_SCOPES', () => {
    it('should have the correct default token scopes', () => {
      expect(DEFAULT_TOKEN_SCOPES).toBe('openid profile email offline')
    })

    it('should be a string', () => {
      expect(typeof DEFAULT_TOKEN_SCOPES).toBe('string')
    })

    it('should contain required OpenID scopes', () => {
      expect(DEFAULT_TOKEN_SCOPES).toContain('openid')
      expect(DEFAULT_TOKEN_SCOPES).toContain('profile')
      expect(DEFAULT_TOKEN_SCOPES).toContain('email')
      expect(DEFAULT_TOKEN_SCOPES).toContain('offline')
    })
  })
})