import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultBrowserHomepage } from './browser-homepage'
import type { BrowserPlaces } from './browser-profiles'

describe('the local default browser homepage', () => {
  let home: string
  let places: BrowserPlaces
  const write = async (file: string, data: unknown) => {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, typeof data === 'string' ? data : JSON.stringify(data))
  }
  const chrome = (file: string) => path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', file)

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), 'antumi-browser-homepage-'))
    places = { home, platform: 'darwin', env: {} }
  })
  afterEach(async () => { await rm(home, { recursive: true, force: true }) })

  it('follows the most recently used Chrome profile and protected homepage settings without changing them', async () => {
    await write(chrome('Local State'), { profile: { last_used: 'Profile 1' } })
    await write(chrome('Default/Preferences'), { homepage: 'https://wrong.example/' })
    await write(chrome('Profile 1/Preferences'), { homepage: 'https://old.example/' })
    const file = chrome('Profile 1/Secure Preferences')
    await write(file, { homepage: 'https://www.baidu.com/', homepage_is_newtabpage: false })
    const before = await readFile(file, 'utf8')
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://www.baidu.com/')
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('uses a web new-tab override before a homepage, while respecting an explicitly blank page', async () => {
    const file = chrome('Default/Preferences')
    await write(file, { newtab_page_location_override: 'https://portal.example/start', homepage: 'https://home.example/' })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://portal.example/start')
    await write(file, { newtab_page_location_override: 'about:blank', homepage: 'https://home.example/' })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('about:blank')
    await write(file, { homepage: 'about:blank', homepage_is_newtabpage: false })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('about:blank')
  })

  it('does not resurrect a stale homepage when Chrome is set to its own new-tab page', async () => {
    await write(chrome('Default/Preferences'), { homepage: 'https://old.example/', homepage_is_newtabpage: true })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://www.google.com/')
  })

  it('uses the configured search provider webpage when the browser supplies an internal new-tab page', async () => {
    const file = chrome('Default/Preferences')
    await write(file, { default_search_provider_data: { template_url_data: { new_tab_url: 'https://start.example/search-home' } } })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://start.example/search-home')
    await write(file, { default_search_provider_data: { template_url_data: { url: 'https://www.baidu.com/s?wd={searchTerms}' } } })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://www.baidu.com/')
    await write(file, { default_search_provider_data: { template_url_data: { url: '{google:baseURL}search?q={searchTerms}' } } })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://www.google.com/')
  })

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'chrome://newtab', 'chrome-extension://test/newtab.html', 'https://user:secret@example.com/'])('never imports %s as a homepage', async (homepage) => {
    await write(chrome('Default/Preferences'), { homepage })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBe('https://www.google.com/')
  })

  it('falls back to a blank page for unsupported browsers, unreadable configuration and malformed profile paths', async () => {
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBeNull()
    await write(chrome('Default/Preferences'), '{broken')
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBeNull()
    await write(chrome('Default/Preferences'), { homepage: 'https://home.example/' })
    expect(await defaultBrowserHomepage('Unknown Browser', places)).toBeNull()
    await write(chrome('Local State'), { profile: { last_used: '../../Private' } })
    expect(await defaultBrowserHomepage('Google Chrome', places)).toBeNull()
  })

  it('reads only the system default browser, with Windows and Linux application names and data folders', async () => {
    const local = path.join(home, 'Local')
    const config = path.join(home, 'custom-config')
    await write(path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Preferences'), {})
    await write(path.join(config, 'google-chrome', 'Default', 'Preferences'), { homepage: 'https://linux.example/' })
    expect(await defaultBrowserHomepage('Microsoft Edge', { ...places, platform: 'win32', env: { LOCALAPPDATA: local } })).toBe('https://www.bing.com/')
    expect(await defaultBrowserHomepage('google-chrome.desktop', { ...places, platform: 'linux', env: { XDG_CONFIG_HOME: config } })).toBe('https://linux.example/')
    expect(await defaultBrowserHomepage('Microsoft Edge', { ...places, platform: 'win32' })).toBeNull()
  })

  it('uses the Firefox install default instead of an unrelated profile and parses preferences without executing them', async () => {
    const root = path.join(home, 'Library', 'Application Support', 'Firefox')
    await write(path.join(root, 'profiles.ini'), '[Profile0]\nName=Old\nPath=Profiles/old\nIsRelative=1\nDefault=1\n[Install123]\nDefault=Profiles/current\nLocked=1\n')
    await write(path.join(root, 'Profiles/old/prefs.js'), 'user_pref("browser.startup.homepage", "https://wrong.example/");')
    await write(path.join(root, 'Profiles/current/prefs.js'), 'throw new Error("must not execute");\nuser_pref("browser.startup.homepage", "https://home.example/?q=\\"test\\"|https://second.example/");\n')
    expect(await defaultBrowserHomepage('Firefox', places)).toBe('https://home.example/?q=%22test%22')
  })

  it('rejects a Firefox profile that traverses outside its configuration folder', async () => {
    const root = path.join(home, 'Library', 'Application Support', 'Firefox')
    await write(path.join(root, 'profiles.ini'), '[Profile0]\nPath=../../private\nIsRelative=1\nDefault=1\n')
    expect(await defaultBrowserHomepage('Firefox', places)).toBeNull()
  })

  it.skipIf(process.platform !== 'darwin')('reads a Safari homepage from the sandbox plist without changing it', async () => {
    const file = path.join(home, 'Library/Containers/com.apple.Safari/Data/Library/Preferences/com.apple.Safari.plist')
    const plist = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>HomePage</key><string>https://home.example/?a=1&amp;b=2</string></dict></plist>'
    await write(file, plist)
    expect(await defaultBrowserHomepage('Safari', places)).toBe('https://home.example/?a=1&b=2')
    expect(await readFile(file, 'utf8')).toBe(plist)
  })
})
