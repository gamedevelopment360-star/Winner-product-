// viral.js: YouTube Viral Product Finder.
// Route: GET /api/research/youtube-viral
// Finds product videos from the last VIDEO_DAYS (default 30) days that have at least MIN_VIDEO_VIEWS (default 1,000,000) views.
// Returns views, likes, comments and views per day. Uses YOUTUBE_API_KEY (already in Render).
// Cost: 3 searches (300 units) + 1 lookup of the free 10,000 units a day. The list is kept for 6 hours.

const cache = { at: 0, data: null };
const QUERIES = ['viral products you need', 'tiktok made me buy it gadgets', 'amazon finds gadgets worth buying'];

module.exports = function registerViral(app) {
  app.get('/api/research/youtube-viral', async (req, res) => {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return res.status(503).json({ error: 'YOUTUBE_API_KEY is not set on the server.' });
    const minViews = parseInt(process.env.MIN_VIDEO_VIEWS, 10) || 1000000;
    const days = parseInt(process.env.VIDEO_DAYS, 10) || 30;
    if (cache.data && Date.now() - cache.at < 6 * 3600 * 1000) return res.json({ ...cache.data, cached: true });
    try {
      const H = { 'x-goog-api-key': key };
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const ids = [];
      for (const q of QUERIES) {
        const sUrl = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&order=viewCount&relevanceLanguage=en&publishedAfter='
          + encodeURIComponent(since) + '&q=' + encodeURIComponent(q);
        const sj = await (await fetch(sUrl, { headers: H })).json();
        if (sj.error) {
          const why = (sj.error.errors && sj.error.errors[0] && sj.error.errors[0].reason) || sj.error.status || '';
          const msg = why === 'quotaExceeded' ? 'YouTube daily limit reached. Try again tomorrow.' : 'YouTube said: ' + (sj.error.message || why || 'error');
          return res.status(502).json({ error: msg });
        }
        for (const i of sj.items || []) { const id = i.id && i.id.videoId; if (id && !ids.includes(id)) ids.push(id); }
      }
      if (!ids.length) return res.json({ videos: [] });
      const now = Date.now();
      const all = [];
      for (let i = 0; i < ids.length; i += 50) {
        const vUrl = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=' + ids.slice(i, i + 50).join(',');
        const vj = await (await fetch(vUrl, { headers: H })).json();
        if (vj.error) return res.status(502).json({ error: 'YouTube said: ' + (vj.error.message || 'error') });
        for (const v of vj.items || []) {
          const sn = v.snippet || {};
          const st = v.statistics || {};
          const views = Number(st.viewCount) || 0;
          if (views < minViews) continue;
          const likes = st.likeCount != null ? Number(st.likeCount) : null;
          const comments = st.commentCount != null ? Number(st.commentCount) : null;
          const ageDays = Math.max(1, (now - Date.parse(sn.publishedAt || now)) / 86400000);
          const th = sn.thumbnails || {};
          all.push({
            id: v.id, title: sn.title || '', channel: sn.channelTitle || '', publishedAt: sn.publishedAt || null,
            views, likes, comments, viewsPerDay: Math.round(views / ageDays),
            thumb: (th.medium && th.medium.url) || (th.default && th.default.url) || '',
            url: 'https://www.youtube.com/watch?v=' + v.id,
          });
        }
      }
      const videos = all.sort((a, b) => b.viewsPerDay - a.viewsPerDay).slice(0, 20);
      const data = { videos, minViews };
      cache.at = Date.now(); cache.data = data;
      res.json(data);
    } catch (e) {
      console.error('viral videos failed:', e.message || e);
      res.status(502).json({ error: 'Could not reach YouTube.' });
    }
  });
};
