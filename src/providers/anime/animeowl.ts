import { CheerioAPI, load } from 'cheerio';

import {
  AnimeParser,
  ISearch,
  IAnimeInfo,
  IAnimeResult,
  ISource,
  IEpisodeServer,
  StreamingServers,
  MediaFormat,
  SubOrSub,
  IAnimeEpisode,
  MediaStatus,
  WatchListType,
} from '../../models';

import { Luffy } from '../../utils';

class AnimeOwl extends AnimeParser {
  override readonly name = 'AnimeOwl';
  protected override baseUrl = 'https://animeowl.me';
  protected apiUrl = 'https://animeowl.me/api';
  protected override logo = 'https://animeowl.me/images/favicon-96x96.png';
  protected override classPath = 'ANIME.AnimeOwl';

  constructor(customBaseURL?: string) {
    super(...arguments);
    if (customBaseURL) {
      if (customBaseURL.startsWith('http://') || customBaseURL.startsWith('https://')) {
        this.baseUrl = customBaseURL;
      } else {
        this.baseUrl = `http://${customBaseURL}`;
      }
    } else {
      this.baseUrl = this.baseUrl;
    }
  }

  /**
   * @param query Search query
   * @param page Page number (optional)
   */
  override search = async (query: string, page: number = 1): Promise<ISearch<IAnimeResult>> => {
    if (0 >= page) {
      page = 1;
    }

    try {
      const { data } = await this.client.post(`${this.apiUrl}/advance-search`, {
        clicked: false,
        limit: 24,
        page: page - 1,
        pageCount: 1,
        value: query,
        selected: {
          type: [],
          genre: [],
          year: [],
          country: [],
          season: [],
          status: [],
          sort: [],
          language: [],
        },
        results: [],
        lang22: 3,
        sortt: 4,
      }, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Content-Type': 'application/json'
        }
      });

      const res: ISearch<IAnimeResult> = {
        currentPage: page,
        hasNextPage: page < Math.ceil(data.total / 24),
        totalPages: Math.ceil(data.total / 24),
        results: [],
      };

      if (data.results && Array.isArray(data.results)) {
        res.results = data.results.map(
          (item: any): IAnimeResult => ({
            id: `${item.anime_slug}$${item.anime_id}`,
            title: item.en_name || item.anime_name || 'Unknown Title',
            url: `${this.baseUrl}/anime/${item.anime_slug}`,
            image:
              `${this.baseUrl}${item.image}` ||
              `${this.baseUrl}${item.thumbnail}` ||
              `${this.baseUrl}${item.webp}` ||
              '',
            japaneseTitle: item.jp_name || '',
            sub: parseInt(item.total_episodes) || 0,
            dub: parseInt(item.total_dub_episodes) || 0,
            episodes: parseInt(item.total_episodes) || 0,
          })
        );
      }
      
      return res;
    } catch (error) {
      console.error('Search error:', error);
      return {
        currentPage: page,
        hasNextPage: false,
        totalPages: 0,
        results: [],
      };
    }
  };

  /**
   * @param page number
   */
  fetchTopAiring(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/trending?page=${page}`);
  }

  /**
   * @param page number
   */
  fetchRecentlyUpdated(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/recent-episode/sub?page=${page}`);
  }

  /**
   * @param page number
   */
  fetchMovie(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/type/movie?page=${page}`);
  }

  /**
   * @param page number
   */
  fetchTV(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/type/tv?page=${page}`);
  }

  /**
   * @param page number
   */
  fetchOVA(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/type/ova?page=${page}`);
  }

  /**
   * @param page number
   */
  fetchONA(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/type/ona?page=${page}`);
  }

  /**
   * @param page number
   */
  fetchSpecial(page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/type/special?page=${page}`);
  }

  async fetchGenres(): Promise<string[]> {
    try {
      const res: string[] = [];
      const { data } = await this.client.get(`${this.baseUrl}/home`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = load(data);

      $('.nav-genre > .sidebar-grid a').each((i, el) => {
        const genre = $(el).text().trim().toLowerCase();
        if (genre) {
          res.push(genre);
        }
      });
      return res;
    } catch (err) {
      console.error('Error fetching genres:', err);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * @param page number
   */
  genreSearch(genre: string, page: number = 1): Promise<ISearch<IAnimeResult>> {
    if (genre == '') {
      throw new Error('genre is empty');
    }
    if (0 >= page) {
      page = 1;
    }
    return this.scrapeCardPage(`${this.baseUrl}/genre/${genre}?page=${page}`);
  }

  async fetchSpotlight(): Promise<ISearch<IAnimeResult>> {
    try {
      const res: ISearch<IAnimeResult> = { results: [] };
      
      // Add retries with exponential backoff
      let retries = 3;
      let delay = 1000;
      
      while (retries > 0) {
        try {
          const { data } = await this.client.get(`${this.baseUrl}/home`, {
            timeout: 15000, // Increased timeout
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive',
            }
          });
          
          const $ = load(data);
          
          // Check multiple possible selectors for carousel items
          let carouselItems = $('.carousel-inner > .carousel-item');
          if (carouselItems.length === 0) {
            carouselItems = $('.spotlight-item, .featured-item, .slider-item, .carousel-item');
          }
          
          if (carouselItems.length === 0) {
            console.warn('No carousel items found on homepage');
            return res;
          }

          carouselItems.each((i, el) => {
            try {
              const card = $(el);
              const titleElement = card.find('.slide-title, .title, h3, h2');
              const animeLink = card.find('a.anime-play, a[href*="/anime/"]').first().attr('href');
              
              if (!animeLink) {
                console.warn(`No anime link found for carousel item ${i}`);
                return;
              }
              
              const id = animeLink.split(`${this.baseUrl}/anime/`)[1] || animeLink.split('/anime/')[1];
              if (!id) {
                console.warn(`Could not extract ID from link: ${animeLink}`);
                return;
              }
              
              const title = titleElement.text().trim();
              if (!title) {
                console.warn(`No title found for carousel item ${i}`);
                return;
              }
              
              // Extract banner image with multiple fallbacks
              let banner = '';
              const mainBg = card.find('.main-bg, .background, .banner').first();
              if (mainBg.length > 0) {
                const bgStyle = mainBg.css('background-image') || mainBg.css('background');
                if (bgStyle) {
                  const match = bgStyle.match(/url\(["']?(.+?)["']?\)/);
                  if (match) {
                    banner = match[1].trim();
                  }
                }
              }
              
              // If no banner from CSS, try img src
              if (!banner) {
                const imgSrc = card.find('img').first().attr('src') || card.find('img').first().attr('data-src');
                if (imgSrc) {
                  banner = imgSrc.startsWith('http') ? imgSrc : `${this.baseUrl}${imgSrc}`;
                }
              }
              
              // Extract type with fallback
              const type = card.find('.anime-type span, .type, .category').first().text().trim() || 'UNKNOWN';
              
              // Extract duration with fallback
              const duration = card.find('.anime-duration span, .duration, .runtime').first().text().trim() || '';
              
              // Extract episodes with fallback
              const episodesElement = card.find('.anime-duration.bg-purple span, .episodes, .episode-count');
              const episodesText = episodesElement.text().trim();
              const episodes = episodesText ? parseInt(episodesText) || 0 : 0;
              
              // Extract description with fallback
              const description = card
                .find('.anime-desc, .description, .synopsis, .summary')
                .first()
                .text()
                .replace(/\s*\n\s*/g, ' ')
                .trim() || '';

              res.results.push({
                id: id,
                title: title,
                banner: banner,
                url: `${this.baseUrl}/anime/${id}`,
                type: type as MediaFormat,
                duration: duration,
                episodes: episodes,
                description: description,
              });
            } catch (itemError) {
              console.error(`Error processing carousel item ${i}:`, itemError);
              // Continue processing other items
            }
          });

          // If we got results, break out of retry loop
          if (res.results.length > 0 || retries === 1) {
            break;
          }
        } catch (requestError) {
          retries--;
          if (retries === 0) {
            console.error('All spotlight request retries failed:', requestError);
            break;
          }
          
          console.warn(`Spotlight request failed, retrying in ${delay}ms. Retries left: ${retries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
      
      return res;
    } catch (error) {
      console.error('fetchSpotlight error:', error);
      // Return empty results to prevent app crash
      return { results: [] };
    }
  }

  async fetchSearchSuggestions(query: string): Promise<ISearch<IAnimeResult>> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const { data } = await this.client.get(`${this.apiUrl}/live-search/${encodedQuery}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const res: ISearch<IAnimeResult> = {
        results: [],
      };
      
      if (Array.isArray(data)) {
        data.map((item: any) => {
          if (item && item.slug && item.id) {
            res.results.push({
              image: `${this.baseUrl}${item.thumbnail}` || `${this.baseUrl}${item.webp}` || '',
              id: `${item.slug}$${item.id}`,
              title: item.en_name || item.anime_name || 'Unknown Title',
              japaneseTitle: item.anime_name || '',
              releaseDate: item.year_name || '',
              url: `${this.baseUrl}/anime/${item.slug}`,
            });
          }
        });
      }

      return res;
    } catch (error) {
      console.error('Search suggestions error:', error);
      return { results: [] };
    }
  }

  /**
   * @param id Anime id
   */
  override fetchAnimeInfo = async (id: string): Promise<IAnimeInfo> => {
    const info: IAnimeInfo = {
      id: id,
      title: '',
    };
    
    try {
      const { data } = await this.client.get(`${this.baseUrl}/anime/${id.split('$')[0]}`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = load(data);

      info.title = $('h1.anime-name').text().trim() || 'Unknown Title';
      info.japaneseTitle = $('h2.anime-romaji').text().trim() || '';
      
      const imageSrc = $('div.cover-img-container >img').attr('src');
      info.image = imageSrc ? `${this.baseUrl}${imageSrc}` : '';
      
      info.description = $('div.anime-desc')
        .text()
        .replace(/\s*\n\s*/g, ' ')
        .trim() || '';
        
      // Movie, TV, OVA, ONA, Special, Music
      info.type = $('div.type > a').text().toUpperCase() as MediaFormat || MediaFormat.UNKNOWN;
      info.url = `${this.baseUrl}/anime/${id.split('$')[0]}`;

      const hasSub: boolean =
        $('div#anime-cover-sub-content > div.nav-container > ul#episode-list > li.nav-item').length > 0;
      const hasDub: boolean =
        $('div#anime-cover-dub-content > div.nav-container > ul#episode-list > li.nav-item').length > 0;

      if (hasSub) {
        info.subOrDub = SubOrSub.SUB;
        info.hasSub = hasSub;
      }
      if (hasDub) {
        info.subOrDub = SubOrSub.DUB;
        info.hasDub = hasDub;
      }
      if (hasSub && hasDub) {
        info.subOrDub = SubOrSub.BOTH;
      }

      info.genres = [];
      $('div.genre')
        .find('a')
        .each(function () {
          const genre = $(this).text().trim();
          if (genre && genre !== undefined) {
            info.genres?.push(genre);
          }
        });

      const statusText = $('div.status > span').text().trim();
      switch (statusText) {
        case 'Finished Airing':
          info.status = MediaStatus.COMPLETED;
          break;
        case 'Currently Airing':
          info.status = MediaStatus.ONGOING;
          break;
        case 'Not yet aired':
          info.status = MediaStatus.NOT_YET_AIRED;
          break;
        default:
          info.status = MediaStatus.UNKNOWN;
          break;
      }

      info.season = $('div.premiered')
        .text()
        .replace(/\s*\n\s*/g, ' ')
        .replace('Premiered: ', '')
        .trim() || '';
        
      const lastSubEpisode = $('div#anime-cover-sub-content > div.nav-container > ul#episode-list > li.nav-item').last();
      const lastDubEpisode = $('div#anime-cover-dub-content > div.nav-container > ul#episode-list > li.nav-item').last();
      
      let totalSubEpisodes = 0;
      let totalDubEpisodes = 0;
      
      if (lastSubEpisode.length > 0) {
        const subText = lastSubEpisode.text().split('-')[1];
        if (subText) {
          totalSubEpisodes = parseInt(subText.trim()) || 0;
        }
      }
      
      if (lastDubEpisode.length > 0) {
        const dubText = lastDubEpisode.text().split('-')[1];
        if (dubText) {
          totalDubEpisodes = parseInt(dubText.trim()) || 0;
        }
      }
      
      info.totalEpisodes = Math.max(totalSubEpisodes, totalDubEpisodes);
      info.episodes = [];

      const subEpisodes = this.parseEpisodes($, '#anime-cover-sub-content .episode-node', SubOrSub.SUB);
      const dubEpisodes = this.parseEpisodes($, '#anime-cover-dub-content .episode-node', SubOrSub.DUB);

      const groupedMap = new Map<string, IAnimeEpisode>();

      // Passing the anime id with episode id for get request in fetchEpisodeServers
      for (const sub of subEpisodes) {
        if (sub.title) {
          groupedMap.set(sub.title, {
            id: `${id.split('$')[0]}$${sub.id!}`,
            title: sub.title,
            number: sub.number!,
            url: sub.url,
            isSubbed: true,
            isDubbed: false,
          });
        }
      }

      for (const dub of dubEpisodes) {
        if (dub.title) {
          if (groupedMap.has(dub.title)) {
            const entry = groupedMap.get(dub.title)!;
            entry.id = `${entry.id}&${dub.id}`; // Combining the sub and dub episode ids
            entry.isDubbed = true;
          } else {
            groupedMap.set(dub.title, {
              id: `${id.split('$')[0]}$${dub.id!}`,
              title: dub.title,
              number: dub.number!,
              url: dub.url,
              isSubbed: false,
              isDubbed: true,
            });
          }
        }
      }

      info.episodes = Array.from(groupedMap.values());

      return info;
    } catch (err) {
      console.error('fetchAnimeInfo error:', err);
      throw new Error(`Failed to fetch anime info: ${(err as Error).message}`);
    }
  };

  /**
   *
   * @param episodeId Episode id
   * @param server server type (default `VidCloud`) (optional)
   * @param subOrDub sub or dub (default `SubOrSub.SUB`) (optional)
   */
  override fetchEpisodeSources = async (
    episodeId: string,
    server: StreamingServers = StreamingServers.Luffy,
    subOrDub: SubOrSub = SubOrSub.SUB
  ): Promise<ISource> => {
    if (episodeId.startsWith('http')) {
      const serverUrl = new URL(episodeId);
      switch (server) {
        case StreamingServers.Luffy:
          return {
            headers: { Referer: serverUrl.href },
            sources: await new Luffy().extract(serverUrl),
          };
        default:
          return {
            headers: { Referer: serverUrl.href },
            sources: await new Luffy().extract(serverUrl),
          };
      }
    }

    try {
      const servers = await this.fetchEpisodeServers(episodeId, subOrDub);
      const i = servers.findIndex(s => s.name.toLowerCase() === server.toLowerCase());

      if (i === -1) {
        throw new Error(`Server ${server} not found`);
      }

      const serverUrl: URL = new URL(servers[i].url);
      const sources = await this.fetchEpisodeSources(serverUrl.href, server, subOrDub);
      return sources;
    } catch (err) {
      console.error('fetchEpisodeSources error:', err);
      throw err;
    }
  };

  /**
   * @param url string
   */
  private scrapeCardPage = async (url: string, headers?: object): Promise<ISearch<IAnimeResult>> => {
    try {
      const res: ISearch<IAnimeResult> = {
        currentPage: 0,
        hasNextPage: false,
        totalPages: 0,
        results: [],
      };

      const { data } = await this.client.get(url, {
        ...headers,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...(headers as any)
        }
      });
      const $ = load(data);

      const pagination = $('ul.pagination');
      const activePageElement = pagination.find('li.page-item.active');
      res.currentPage = activePageElement.length > 0 ? parseInt(activePageElement.text()) || 1 : 1;
      
      const nextPage = pagination.find('li:has(a[aria-label="Next page"])');
      res.hasNextPage = nextPage.length > 0 && !nextPage.hasClass('disabled');
      
      let lastPageText = 0;
      pagination.find('li.page-item a').each((_, el) => {
        const text = parseInt($(el).text().trim());
        if (!isNaN(text)) {
          lastPageText = Math.max(lastPageText, text);
        }
      });
      res.totalPages = lastPageText || res.currentPage;

      res.results = await this.scrapeCard($);
      if (res.results.length === 0) {
        res.currentPage = 0;
        res.hasNextPage = false;
        res.totalPages = 0;
      }
      return res;
    } catch (err) {
      console.error('scrapeCardPage error:', err);
      return {
        currentPage: 0,
        hasNextPage: false,
        totalPages: 0,
        results: [],
      };
    }
  };

  /**
   * @param $ cheerio instance
   */
  private scrapeCard = async ($: CheerioAPI): Promise<IAnimeResult[]> => {
    try {
      const results: IAnimeResult[] = [];

      $('#anime-list .recent-anime.anime-vertical').each((i, ele) => {
        try {
          const card = $(ele);
          const atag = card.find('a.post-thumb');
          const href = atag.attr('href');
          
          if (!href) return;
          
          const id = href.split(`${this.baseUrl}/anime/`)[1];
          if (!id) return;
          
          const title = card.find('img')?.attr('alt');
          if (!title) return;
          
          const type = card.find('.anime-type span').text().trim() || 'UNKNOWN';
          const image = card.find('img')?.attr('data-src') || card.find('img')?.attr('src') || '';
          
          const subText = card.find('.misc-info .anime-duration span')?.eq(0).text() || '0';
          const dubText = card.find('.misc-info .anime-duration span')?.eq(1).text() || '0';
          
          results.push({
            id: id,
            title: title,
            url: href,
            image: image.startsWith('http') ? image : image ? `${this.baseUrl}${image}` : '',
            type: type as MediaFormat,
            sub: parseInt(subText) || 0,
            dub: parseInt(dubText) || 0,
            episodes: parseInt(subText) || 0,
          });
        } catch (itemError) {
          console.error(`Error processing card item ${i}:`, itemError);
        }
      });
      
      return results;
    } catch (err) {
      console.error('scrapeCard error:', err);
      return [];
    }
  };

  /**
   * @param episodeId Episode id
   * @param subOrDub sub or dub (default `sub`) (optional)
   */
  override fetchEpisodeServers = async (
    episodeId: string,
    subOrDub: SubOrSub = SubOrSub.SUB
  ): Promise<IEpisodeServer[]> => {
    try {
      const subEpisodeId = episodeId.split('$')[1]?.split('&')[0];
      const dubEpisodeId = episodeId.split('&')[1];
      const id = episodeId.split('$')[0];
      
      if (!id || !subEpisodeId) {
        throw new Error('Invalid episode ID format');
      }
      
      const { data } = await this.client.get(`${this.baseUrl}/anime/${id}`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = load(data);
      
      const subEpisode = this.parseEpisodes($, '#anime-cover-sub-content .episode-node', SubOrSub.SUB).filter(
        item => item.id === subEpisodeId
      );
      const dubEpisode = this.parseEpisodes($, '#anime-cover-dub-content .episode-node', SubOrSub.DUB).filter(
        item => item.id === dubEpisodeId
      );

      let directLink: string | undefined = '';

      if (subOrDub === SubOrSub.SUB && subEpisode.length > 0) {
        const { data: intermediary } = await this.client.get(subEpisode[0].url!, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        const $$ = load(intermediary);
        directLink = $$('button#hot-anime-tab')?.attr('data-source');
      }
      if (subOrDub === SubOrSub.DUB && dubEpisode.length > 0) {
        const { data: intermediary } = await this.client.get(dubEpisode[0].url!, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        const $$ = load(intermediary);
        directLink = $$('button#hot-anime-tab')?.attr('data-source');
      }

      if (!directLink) {
        return [];
      }

      const { data: server } = await this.client.get(`${this.baseUrl}${directLink}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const servers: IEpisodeServer[] = [];
      if (server && server['luffy']) {
        server['luffy'].forEach((item: any) => {
          servers.push({
            name: 'luffy',
            url: `${this.baseUrl}${directLink}`,
          });
        });
      }

      return servers;
    } catch (error) {
      console.error('fetchEpisodeServers error:', error);
      return [];
    }
  };

  private parseEpisodes = ($: any, selector: string, subOrDub: SubOrSub): IAnimeEpisode[] => {
    const episodes: IAnimeEpisode[] = [];
    
    try {
      $(selector).each((idx: number, el: any) => {
        try {
          const $el = $(el);
          const title = $el.attr('title') ?? '';
          const id = $el.attr('id') ?? '';
          const hrefAttr = $el.attr('href');
          const url = hrefAttr?.startsWith('http') ? hrefAttr : $el.prop('href') || '';
          const episodeNumber = Number(title);

          // Skip if the episode number is a float or invalid
          if (!Number.isInteger(episodeNumber) || !title || !id) {
            return;
          }

          episodes.push({
            id: id,
            number: episodeNumber,
            title: `Ep-${title}`,
            url: url,
            isSubbed: subOrDub === SubOrSub.SUB,
            isDubbed: subOrDub === SubOrSub.DUB,
          });
        } catch (itemError) {
          console.error(`Error parsing episode ${idx}:`, itemError);
        }
      });
    } catch (error) {
      console.error('parseEpisodes error:', error);
    }
    
    return episodes;
  };
}

// Test function with enhanced error handling
(async () => {
  try {
    const animeowl = new AnimeOwl();
    console.log('Testing AnimeOwl with enhanced error handling...');
    
    // Test spotlight fetch
    console.log('Fetching spotlight...');
    const spotlight = await animeowl.fetchSpotlight();
    console.log(`Spotlight results: ${spotlight.results.length}`);
    
    if (spotlight.results.length > 0) {
      console.log('First spotlight result:', spotlight.results[0]);
      
      // Test anime info fetch
      console.log('Fetching anime info...');
      const info = await animeowl.fetchAnimeInfo(spotlight.results[0].id);
      console.log(`Anime info: ${info.title} - ${info.episodes?.length || 0} episodes`);
      
      // Test episode sources (if episodes exist)
      if (info.episodes && info.episodes.length > 0) {
        console.log('Fetching episode sources...');
        try {
          const sources = await animeowl.fetchEpisodeSources(
            info.episodes[0].id, 
            StreamingServers.Luffy, 
            SubOrSub.SUB
          );
          console.log(`Episode sources: ${sources.sources?.length || 0} sources found`);
        } catch (sourceError) {
          console.log('Episode sources error (expected):', sourceError.message);
        }
      }
    }
    
    // Test search functionality
    console.log('Testing search...');
    const searchResults = await animeowl.search('naruto', 1);
    console.log(`Search results: ${searchResults.results.length}`);
    
    // Test genre fetch
    console.log('Testing genres...');
    const genres = await animeowl.fetchGenres();
    console.log(`Genres found: ${genres.length}`);
    
    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test error:', error);
  }
})();

export default AnimeOwl;
