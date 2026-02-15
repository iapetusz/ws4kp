// community photo feed display
// fetches photos from an HTTP directory listing and cycles through them

import STATUS from './status.mjs';
import { safeText } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import Setting from './utils/setting.mjs';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp)$/i;
const MAX_PHOTOS = 10;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

// cached photo list
let cachedPhotos = null;
let cacheTimestamp = 0;

class PhotoFeed extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Photo Feed', false);

		// set timings - 7 seconds per photo
		this.timing.totalScreens = 0;
		this.timing.delay = 1;
		this.timing.baseDelay = 7000;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		const url = photoFeedUrl.value;
		if (!url) {
			this.setStatus(STATUS.noData);
			return;
		}

		try {
			const now = Date.now();
			let photos;

			// use cache if still fresh
			if (cachedPhotos && (now - cacheTimestamp) < CACHE_DURATION_MS && !refresh) {
				photos = cachedPhotos;
			} else {
				photos = await fetchPhotoList(url);
				if (photos && photos.length > 0) {
					cachedPhotos = photos;
					cacheTimestamp = now;
				}
			}

			if (!photos || photos.length === 0) {
				this.setStatus(STATUS.noData);
				return;
			}

			this.data = photos.slice(0, MAX_PHOTOS);
			this.timing.totalScreens = this.data.length;
			this.calcNavTiming();
			this.screenIndex = 0;
			this.setStatus(STATUS.loaded);
		} catch (error) {
			console.error(`Photo feed error: ${error.message}`);
			if (this.isEnabled) this.setStatus(STATUS.failed);
		}
	}

	async drawCanvas() {
		super.drawCanvas();

		const photo = this.data[this.screenIndex];
		if (!photo) {
			this.finishDraw();
			return;
		}

		// fill the template
		const fill = {
			photo: { type: 'img', src: photo.url },
			caption: photo.name,
		};
		const elem = this.fillTemplate('photo', fill);

		// update the container
		const container = this.elem.querySelector('.photo-container');
		container.innerHTML = '';
		container.append(elem);

		this.finishDraw();
	}
}

// fetch photo list from a JSON manifest or HTML directory listing
const fetchPhotoList = async (directoryUrl) => {
	let response;

	// use the server-side proxy to avoid CORS issues, fall back to direct fetch
	if (window.WS4KP_SERVER_AVAILABLE) {
		response = await safeText(`/photofeed?url=${encodeURIComponent(directoryUrl)}`, { retryCount: 1, timeout: 10000 });
	} else {
		response = await safeText(directoryUrl, { retryCount: 1, timeout: 10000 });
	}

	// fall back to CORS proxy for external URLs
	if (!response) {
		try {
			const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directoryUrl)}`;
			response = await safeText(proxyUrl, { retryCount: 1, timeout: 10000 });
		} catch (_e) {
			// proxy also failed
		}
	}

	if (!response) return [];

	// try parsing as JSON manifest first
	try {
		const json = JSON.parse(response);
		const photos = json?.photos ?? json;
		if (Array.isArray(photos)) {
			return photos
				.filter((p) => p.url && IMAGE_EXTENSIONS.test(p.url))
				.map((p) => ({ name: p.name ?? decodeURIComponent(p.url.split('/').pop()), url: p.url }));
		}
	} catch (_e) {
		// not JSON, fall through to HTML parsing
	}

	// parse as HTML directory listing
	const parser = new DOMParser();
	const doc = parser.parseFromString(response, 'text/html');

	// add base URL for resolving relative links
	const base = doc.createElement('base');
	base.href = directoryUrl.endsWith('/') ? directoryUrl : `${directoryUrl}/`;
	doc.head.append(base);

	const anchors = doc.querySelectorAll('a');
	const photos = [];

	Array.from(anchors).forEach((anchor) => {
		const href = anchor.getAttribute('href');
		if (href && IMAGE_EXTENSIONS.test(href)) {
			photos.push({
				name: decodeURIComponent(href.split('/').pop()),
				url: anchor.href,
			});
		}
	});

	return photos;
};

// change of enable handler
const changeEnable = (newValue) => {
	const urlLabel = document.getElementById('settings-photoFeedUrl-label');
	if (urlLabel) {
		urlLabel.style.display = newValue ? 'block' : 'none';
	}
};

// change the url and invalidate cache
const changeUrl = () => {
	cachedPhotos = null;
	cacheTimestamp = 0;
};

const photoFeedEnable = new Setting('photoFeedEnable', {
	name: 'Enable Photo Feed',
	defaultValue: false,
	changeAction: changeEnable,
});

const photoFeedUrl = new Setting('photoFeedUrl', {
	name: 'Photo Feed URL',
	defaultValue: '',
	type: 'string',
	changeAction: changeUrl,
	placeholder: 'Directory listing URL',
});

// add settings to the page
document.addEventListener('DOMContentLoaded', () => {
	const settingsSection = document.querySelector('#settings');
	settingsSection.append(photoFeedEnable.generate(), photoFeedUrl.generate());
	// set initial visibility
	changeEnable(photoFeedEnable.value);
});

// register display
registerDisplay(new PhotoFeed(12, 'photo-feed'));
