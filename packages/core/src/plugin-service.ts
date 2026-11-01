import { mkdir, mkdtemp, rm, lstat } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { rcompare } from 'semver'
import { z } from 'zod'
import { PluginInfo, PluginManifest, PluginVersion, type PluginInstallSource, RecommendedPlugin } from '@antumi/protocol'
import { readJsonIfExists, writePrivateJson } from '@antumi/protocol/node'
import { renameWhenFree } from './patient-rename'
import { packagePath, readManifest, stagePlugin } from './plugin-package'
import { PluginProcess } from './plugin-process'
import { Rejection } from './rejection'
import type { SourceProvider } from './source-provider'
import type { SourceService } from './source-service'
import type { SourceConfigStore } from './source-config'
import recommended from './plugins-recommended.json' with { type: 'json' }

const Installed = z.object({ manifest: PluginManifest, enabled: z.boolean(), versions: z.array(PluginVersion), origin: PluginInfo.shape.origin })
type Installed = z.infer<typeof Installed>
const Registry = z.object({ version: z.literal(1), plugins: z.array(Installed), owners: z.record(z.string(), z.string()) })
type Registry = z.infer<typeof Registry>
type Loaded = { process: PluginProcess; providers: SourceProvider[] }

export class PluginService {
  private registry: Registry = { version: 1, plugins: [], owners: { jira: 'builtin', github: 'antumi.github' } }
  private readonly loaded = new Map<string, Loaded>()
  private readonly problems = new Map<string, string>()
  private pending: Promise<unknown> = Promise.resolve()
  private closing = false
  private readonly catalog = recommended.map((entry) => RecommendedPlugin.parse(entry))

  constructor(
    private readonly root: string,
    private readonly antumiVersion: string,
    private readonly sources: SourceService,
    private readonly config: SourceConfigStore,
    private readonly builtins: readonly SourceProvider[],
    private readonly changed: (plugins: PluginInfo[]) => void = () => {}
  ) {}

  async load(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const raw = await readJsonIfExists(this.pointer)
    if (raw !== undefined) this.registry = Registry.parse(raw)
    for (const record of this.registry.plugins) {
      if (!record.enabled) continue
      try {
        const candidate = await this.prepare(path.join(this.root, record.manifest.id, record.manifest.version))
        if (!isDeepStrictEqual(candidate.process.manifest, record.manifest)) throw new Error('已安装插件的 manifest 发生改变')
        this.loaded.set(record.manifest.id, candidate)
      } catch (error) { this.problems.set(record.manifest.id, this.message(error)) }
    }
    this.publish([])
  }

  recommended(): RecommendedPlugin[] {
    return this.catalog.map((entry) => ({ ...entry }))
  }

  installRecommended(id: string): Promise<PluginInfo> {
    return this.serialize(async () => {
      const entry = this.recommendation(id)
      if (this.registry.plugins.some((record) => record.manifest.id === id)) return this.info(id)
      return this.installInner(this.recommendedSource(entry), id)
    })
  }

  private recommendation(id: string): RecommendedPlugin {
    const entry = this.catalog.find((entry) => entry.id === id)
    if (!entry) throw new Error('这个插件不在推荐列表中')
    return entry
  }

  private recommendedSource(entry: RecommendedPlugin): PluginInstallSource {
    return { kind: 'github', repository: entry.repository, ...(entry.tagPrefix ? { tagPrefix: entry.tagPrefix } : {}), ...(entry.asset ? { asset: entry.asset } : {}) }
  }

  list(): PluginInfo[] {
    return this.registry.plugins.map((record) => ({
      id: record.manifest.id, version: record.manifest.version, sources: record.manifest.contributes.sources,
      enabled: record.enabled, versions: [...record.versions].sort(rcompare), origin: record.origin,
      problem: this.problems.get(record.manifest.id) ?? null
    }))
  }

  install(source: PluginInstallSource): Promise<PluginInfo> {
    return this.serialize(() => this.installInner(source))
  }

  update(id: string): Promise<PluginInfo> {
    return this.serialize(async () => {
      const record = this.record(id)
      return this.installInner(this.updateSource(record), id)
    })
  }

  private updateSource(record: Installed): PluginInstallSource {
    const origin = record.origin
    if (origin.kind === 'bundled') return this.recommendedSource(this.recommendation(record.manifest.id))
    if (origin.kind === 'local') return origin
    const entry = this.catalog.find((entry) => entry.id === record.manifest.id)
    // Only known addresses migrate; forks and local installs stay theirs.
    if (entry && (entry.previousRepositories?.includes(origin.repository) || (entry.repository === origin.repository && !origin.tagPrefix))) return this.recommendedSource(entry)
    return { ...origin, tag: undefined }
  }

  setEnabled(id: string, enabled: boolean): Promise<PluginInfo> {
    return this.serialize(async () => {
      const record = this.record(id)
      const candidate = enabled ? await this.prepare(path.join(this.root, id, record.manifest.version)) : undefined
      if (candidate && !isDeepStrictEqual(candidate.process.manifest, record.manifest)) throw new Error('已安装插件的 manifest 发生改变，请安装新的版本')
      await this.activate({ ...record, enabled }, candidate)
      return this.info(id)
    })
  }

  rollback(id: string, version: string): Promise<PluginInfo> {
    return this.serialize(async () => {
      const record = this.record(id)
      if (!record.versions.includes(version)) throw new Error('没有保留这个版本')
      const candidate = await this.prepare(path.join(this.root, id, version))
      if (candidate.process.manifest.id !== id || candidate.process.manifest.version !== version) throw new Error('版本目录与 manifest 不匹配')
      await this.activate({ ...record, manifest: candidate.process.manifest }, record.enabled ? candidate : undefined, candidate)
      return this.info(id)
    })
  }

  uninstall(id: string): Promise<void> {
    return this.serialize(async () => {
      const record = this.record(id)
      const ids = record.manifest.contributes.sources.map((source) => source.id)
      await this.sources.pause(ids)
      try {
        const next = { ...this.registry, plugins: this.registry.plugins.filter((plugin) => plugin.manifest.id !== id) }
        await writePrivateJson(this.pointer, next)
        this.registry = next
        this.loaded.get(id)?.process.stop()
        this.loaded.delete(id)
        this.problems.delete(id)
      } finally { this.publish(ids) }
      // Source settings, credentials and imported tasks intentionally survive uninstall.
      await rm(path.join(this.root, id), { recursive: true, force: true })
    })
  }

  async close(): Promise<void> {
    this.closing = true
    for (const plugin of this.loaded.values()) plugin.process.stop()
    await this.pending.catch(() => {})
    for (const plugin of this.loaded.values()) plugin.process.stop()
  }

  private get pointer(): string { return path.join(this.root, 'active.json') }

  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const next = this.pending.then(() => {
      if (this.closing) throw new Error('插件服务正在关闭')
      return run()
    }).catch((error: unknown) => { throw new Rejection('plugin-failed', this.message(error)) })
    this.pending = next.catch(() => {})
    return next
  }

  private async installInner(source: PluginInstallSource, expectedId?: string, origin: Installed['origin'] = source): Promise<PluginInfo> {
    const staging = await mkdtemp(path.join(this.root, '.install-'))
    let installedPath: string | undefined
    let installedVersion: { id: string; version: string } | undefined
    try {
      await stagePlugin(source, staging)
      const manifest = await readManifest(staging, this.antumiVersion)
      if (expectedId && manifest.id !== expectedId) throw new Error('更新包的插件 ID 不匹配')
      this.checkOwners(manifest)
      const current = this.registry.plugins.find((entry) => entry.manifest.id === manifest.id)
      if (expectedId && current && rcompare(manifest.version, current.manifest.version) > 0) throw new Error('发布版本早于当前版本，请使用版本切换回退')
      if (current?.versions.includes(manifest.version)) {
        if (expectedId && current.manifest.version === manifest.version) {
          if (!isDeepStrictEqual(current.origin, origin)) {
            const next = { ...this.registry, plugins: this.registry.plugins.map((record) => record.manifest.id === manifest.id ? { ...record, origin } : record) }
            await writePrivateJson(this.pointer, next)
            this.registry = next
            this.publish([])
          }
          return this.info(manifest.id)
        }
        throw new Error('这个版本已经安装，请选择切换版本')
      }
      const preview = await this.prepare(staging)
      await this.validateSettings(preview)
      const directory = path.join(this.root, manifest.id)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const destination = path.join(directory, manifest.version)
      // An unreferenced directory can remain after a crash between staging and pointer commit.
      try {
        const existing = await lstat(destination)
        if (!existing.isDirectory()) throw new Error('版本目录无效')
        await rm(destination, { recursive: true })
      }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
      await renameWhenFree(staging, destination)
      installedPath = destination
      installedVersion = { id: manifest.id, version: manifest.version }
      const candidate = await this.prepare(destination)
      const record: Installed = { manifest, enabled: current?.enabled ?? true, versions: [...(current?.versions ?? []), manifest.version], origin }
      await this.activate(record, record.enabled ? candidate : undefined, candidate)
      return this.info(manifest.id)
    } finally {
      await rm(staging, { recursive: true, force: true })
      const installed = installedVersion
      const retained = installed && this.registry.plugins.some((record) => record.manifest.id === installed.id && record.versions.includes(installed.version))
      if (installedPath && !retained) await rm(installedPath, { recursive: true, force: true })
    }
  }

  private async prepare(directory: string): Promise<Loaded> {
    const manifest = await readManifest(directory, this.antumiVersion)
    this.checkOwners(manifest)
    const process = new PluginProcess(manifest, packagePath(directory, manifest.entry.main))
    return { process, providers: await process.providers() }
  }

  private checkOwners(manifest: PluginManifest): void {
    for (const source of manifest.contributes.sources) {
      const owner = this.registry.owners[source.id]
      const migratingJira = source.id === 'jira' && owner === 'builtin' && manifest.id === 'antumi.jira'
      if ((owner && owner !== manifest.id && !migratingJira) || this.builtins.some((provider) => provider.id === source.id)) throw new Error(`来源 ${source.id} 已被占用`)
    }
    const old = this.registry.plugins.find((record) => record.manifest.id === manifest.id)
    if (old && !isDeepStrictEqual(old.manifest.contributes.sources.map((source) => source.id).sort(), manifest.contributes.sources.map((source) => source.id).sort())) throw new Error('首版不支持更新时增删来源 ID')
  }

  private async validateSettings(candidate: Loaded): Promise<void> {
    for (const provider of candidate.providers) {
      const defaults = Object.fromEntries(provider.settings.flatMap((field) => field.default === undefined ? [] : [[field.key, field.default]]))
      for (const saved of this.config.list().filter((entry) => entry.provider === provider.id)) {
        const values = { ...defaults, ...saved.settings }
        for (const field of provider.settings) if (field.required && !values[field.key]) throw new Error(`新版本需要设置 ${field.label}，请先配置`)
        const normalized = await provider.normalizeSettings(values)
        if (!isDeepStrictEqual(normalized, values)) throw new Error('新版本会改变已有设置，首版只支持兼容更新')
      }
    }
  }

  private async activate(record: Installed, candidate?: Loaded, checked: Loaded | undefined = candidate): Promise<void> {
    const id = record.manifest.id
    const ids = record.manifest.contributes.sources.map((source) => source.id)
    await this.sources.pause(ids)
    try {
      if (checked) await this.validateSettings(checked)
      const next: Registry = {
        version: 1,
        plugins: [...this.registry.plugins.filter((entry) => entry.manifest.id !== id), record],
        owners: { ...this.registry.owners, ...Object.fromEntries(ids.map((source) => [source, id])) }
      }
      await writePrivateJson(this.pointer, next)
      this.registry = next
      this.loaded.get(id)?.process.stop()
      if (candidate) this.loaded.set(id, candidate)
      else this.loaded.delete(id)
      this.problems.delete(id)
    } finally { this.publish(ids) }
  }

  private publish(ids: readonly string[]): void {
    this.sources.replaceProviders([...this.builtins, ...[...this.loaded.values()].flatMap((plugin) => plugin.providers)], ids)
    this.changed(this.list())
  }

  private record(id: string): Installed {
    const record = this.registry.plugins.find((entry) => entry.manifest.id === id)
    if (!record) throw new Error('插件未安装')
    return record
  }

  private info(id: string): PluginInfo {
    const info = this.list().find((entry) => entry.id === id)
    if (!info) throw new Error('插件未安装')
    return info
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
}
