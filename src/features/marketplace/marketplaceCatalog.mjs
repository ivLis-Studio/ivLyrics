import bundledBlacklist from '../../../blacklist.json' with { type: 'json' };

const GITHUB_TOPIC = 'ivlyrics-addon';
const GITHUB_SEARCH_URL = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(GITHUB_TOPIC)}&per_page=100&sort=stars&order=desc`;
const BLACKLIST_URL_REMOTE = 'https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/refs/heads/main/blacklist.json';

const ADDON_LIST_CACHE_TTL = 5 * 60 * 1000;

function compareVersions(a, b) {
    if (!a || !b) return 0;
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

export function withMarketplaceInstallState(addon, installed) {
    const installedVersion = installed?.version || null;
    return {
        ...addon,
        isInstalled: Boolean(installed),
        installedVersion,
        hasUpdate: compareVersions(addon.version, installedVersion) > 0,
    };
}

export function createMarketplaceCatalog({ request, requestTimeout, installedAddons, debug }) {
    let addonListCache = null;
    let addonListCacheTime = 0;
    let blacklistCache = null;
    let pendingCatalog = null;

    async function requestJson(url, headers) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
        try {
            const response = await request(url, { signal: controller.signal, cache: 'no-cache', headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function toNormalizedSet(values) {
        if (!Array.isArray(values)) return new Set();
        return new Set(
            values
                .map(v => String(v || '').trim().toLowerCase())
                .filter(Boolean)
        );
    }

    function normalizeRepoId(owner, repo) {
        const o = String(owner || '').trim().toLowerCase();
        const r = String(repo || '').trim().toLowerCase();
        return `${o}/${r}`.replace(/^\/+|\/+$/g, '');
    }

    function isRepoBlocked(repo, blacklist) {
        const owner = repo?.owner?.login || '';
        const repoName = repo?.name || '';
        const fullName = normalizeRepoId(owner, repoName);
        return blacklist.blockedRepos.has(fullName) || blacklist.blockedAuthors.has(owner.toLowerCase());
    }

    function buildManifestUrl(repo) {
        const defaultBranch = repo?.default_branch || 'main';
        const fullName = `${repo.owner?.login}/${repo.name}`;
        return `https://raw.githubusercontent.com/${fullName}/${defaultBranch}/manifest.json`;
    }

    function manifestAddonToMarketplaceAddon(manifestAddon, repo) {
        if (!manifestAddon || typeof manifestAddon !== 'object') return null;

        const owner = repo?.owner?.login || '';
        const repoName = repo?.name || '';
        const baseId = normalizeRepoId(owner, repoName);
        const type = String(manifestAddon.type || '').toLowerCase();

        if (typeof manifestAddon.name !== 'string' || !manifestAddon.name ||
            typeof manifestAddon.downloadUrl !== 'string' || !manifestAddon.downloadUrl) return null;
        if (type !== 'lyrics' && type !== 'ai' && type !== 'style') return null;

        // Generate unique ID per addon by slugifying the addon name
        const addonSlug = manifestAddon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const id = `${baseId}/${addonSlug}`;

        const description = manifestAddon.description || repo.description || '';
        const ownerAvatarUrl = repo?.owner?.avatar_url || '';

        return {
            id,
            name: manifestAddon.name,
            type,
            author: manifestAddon.author || owner || baseId,
            authorLogin: owner,
            authorAvatar: ownerAvatarUrl,
            version: manifestAddon.version || '0.0.0',
            updated: manifestAddon.updated || '',
            description,
            githubUrl: manifestAddon.githubUrl || repo.html_url || '',
            preview: manifestAddon.preview || '',
            downloadUrl: manifestAddon.downloadUrl,
            minAppVersion: manifestAddon.minAppVersion || '',
            sourceRepo: baseId,
            stars: repo?.stargazers_count || 0
        };
    }

    async function fetchRepoManifestAddons(repo) {
        try {
            const data = await requestJson(buildManifestUrl(repo));
            if (!Array.isArray(data?.addons)) return [];
            return data.addons.map(addon => manifestAddonToMarketplaceAddon(addon, repo)).filter(Boolean);
        } catch {
            return [];
        }
    }

    function normalizeBlacklist(data) {
        return {
            blockedRepos: toNormalizedSet(data.blockedRepos),
            blockedAuthors: toNormalizedSet(data.blockedAuthors),
            blockedAddonIds: toNormalizedSet(data.blockedAddonIds),
        };
    }

    async function loadBlacklist(forceRefresh) {
        if (!forceRefresh && blacklistCache) return blacklistCache;

        try {
            const data = await requestJson(BLACKLIST_URL_REMOTE);
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                return normalizeBlacklist(data);
            }
        } catch {
            // Use the last known rules, or the copy bundled with the app.
        }
        return blacklistCache;
    }

    async function fetchTopicRepositories() {
        const data = await requestJson(GITHUB_SEARCH_URL, { Accept: 'application/vnd.github+json' });
        if (!Array.isArray(data?.items)) throw new Error('Invalid GitHub topic response');
        return data.items.filter(repo => !repo.archived && !repo.disabled);
    }

    async function loadCatalog(forceRefresh) {
        const [remoteBlacklist, repos] = await Promise.all([loadBlacklist(forceRefresh), fetchTopicRepositories()]);
        blacklistCache = remoteBlacklist;
        const blacklist = remoteBlacklist || normalizeBlacklist(bundledBlacklist);
        const allowedRepos = repos.filter(repo => !isRepoBlocked(repo, blacklist));
        const manifests = await Promise.all(allowedRepos.map(fetchRepoManifestAddons));
        const byId = new Map();
        for (const addon of manifests.flat()) {
            if (!blacklist.blockedAddonIds.has(addon.id) && !byId.has(addon.id)) byId.set(addon.id, addon);
        }
        const addons = [...byId.values()].sort((a, b) => b.stars - a.stars);
        addonListCache = { version: 2, source: `github-topic:${GITHUB_TOPIC}`, addons };
        addonListCacheTime = Date.now();
        debug(`[MarketplaceManager] Loaded ${addons.length} catalog addon(s)`);
        return addonListCache;
    }

    async function fetchAddonList(forceRefresh = false) {
        if (!pendingCatalog && (forceRefresh || !addonListCache || Date.now() - addonListCacheTime >= ADDON_LIST_CACHE_TTL)) {
            pendingCatalog = loadCatalog(forceRefresh).finally(() => { pendingCatalog = null; });
        }
        const catalog = pendingCatalog ? await pendingCatalog : addonListCache;
        return {
            ...catalog,
            addons: catalog.addons.map(addon => withMarketplaceInstallState(addon, installedAddons.get(addon.id)?.metadata)),
        };
    }

    return { fetchAddonList };
}
