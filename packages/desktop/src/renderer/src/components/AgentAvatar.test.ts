import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentProfile } from '@antumi/protocol'
import { AgentAvatar, avatarUri, ProfileAvatar } from './AgentAvatar'

const profile = AgentProfile.parse({ id: '44444444-4444-4444-8444-444444444444', name: '审查员', agent: 'codex', archivedAt: null, createdAt: 0, updatedAt: 0 })

describe('an agent\'s face', () => {
  it('is drawn from its id alone, the same each time and another for another agent', () => {
    const face = avatarUri(profile.id)
    expect(face).toMatch(/^data:image\/svg\+xml;/)
    expect(avatarUri(profile.id)).toBe(face)
    expect(avatarUri('55555555-5555-4555-8555-555555555555')).not.toBe(face)
  })

  it('is an image, so one face\'s SVG ids never meet another\'s', () => {
    expect(renderToStaticMarkup(createElement(AgentAvatar, { id: profile.id }))).toBe(`<img class="agent-avatar" src="${avatarUri(profile.id)}" alt="" draggable="false"/>`)
  })

  it('leaves a direct call\'s stand-in profile, saved nowhere, its agent\'s logo', () => {
    expect(renderToStaticMarkup(createElement(ProfileAvatar, { profile }))).toMatch(/^<svg class="agent-mark agent-mark-codex"/)
  })
})
