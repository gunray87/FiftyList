/** Max stored taste snapshot length. */
export const TASTE_NARRATIVE_MAX_CHARS = 1080;

const ENDS_WITH_SENTENCE = /[.!?]["')\]]?\s*$/;

export function lastCompleteSentenceEnd(text: string): number {
	let lastEnd = -1;
	const re = /[.!?](?:["')\]]?)(?=\s+|$)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		lastEnd = match.index + match[0].length;
	}
	return lastEnd;
}

export function finalizeTasteNarrative(
	narrative: string,
	max = TASTE_NARRATIVE_MAX_CHARS
): string {
	let text = narrative.trim();
	if (!text) return text;

	if (text.length > max) {
		text = text.slice(0, max);
	}

	if (ENDS_WITH_SENTENCE.test(text)) {
		return text;
	}

	const endIdx = lastCompleteSentenceEnd(text);
	if (endIdx > 0) {
		return text.slice(0, endIdx).trim();
	}

	return text;
}

/** @deprecated use finalizeTasteNarrative */
export function trimTasteNarrative(narrative: string, max = TASTE_NARRATIVE_MAX_CHARS): string {
	return finalizeTasteNarrative(narrative, max);
}

export type TasteMovieHighlight = { title?: string; author?: string };

export function buildFilmTasteParagraph(
	movies: TasteMovieHighlight[],
	movieGenres: string[] = []
): string {
	const picks = movies
		.map((m) => ({
			title: typeof m.title === 'string' ? m.title.trim() : '',
			author: typeof m.author === 'string' ? m.author.trim() : '',
		}))
		.filter((m) => m.title.length > 0)
		.slice(0, 3);
	if (picks.length === 0) return '';

	const titlePhrase = picks
		.map((m) => (m.author ? `"${m.title}" (${m.author})` : `"${m.title}"`))
		.join(', ');
	const genrePhrase =
		movieGenres.length > 0
			? `, with a lean toward ${movieGenres.slice(0, 2).join(' and ')}`
			: '';

	return `On film, your highlights include ${titlePhrase}${genrePhrase}.`;
}

function narrativeNamesFilmTitles(narrative: string, movies: TasteMovieHighlight[]): boolean {
	const lower = narrative.toLowerCase();
	return movies.some((m) => {
		const t = typeof m.title === 'string' ? m.title.trim().toLowerCase() : '';
		return t.length >= 3 && lower.includes(t);
	});
}

export function mergeFilmIntoTasteNarrative(
	narrative: string,
	listedMovies: number,
	topRatedMovies: TasteMovieHighlight[],
	movieGenres: string[] = []
): string {
	const text = narrative.trim();
	if (listedMovies <= 0 || topRatedMovies.length === 0) {
		return finalizeTasteNarrative(text);
	}

	const filmPara = buildFilmTasteParagraph(topRatedMovies, movieGenres);
	if (!filmPara) return finalizeTasteNarrative(text);

	if (narrativeNamesFilmTitles(text, topRatedMovies)) {
		return finalizeTasteNarrative(text);
	}

	const withoutOldFilmSuffix = text.replace(/\s*On film,[\s\S]*$/, '').trim();
	const merged = withoutOldFilmSuffix.length > 0 ? `${withoutOldFilmSuffix} ${filmPara}` : filmPara;
	return finalizeTasteNarrative(merged);
}

/** @deprecated use mergeFilmIntoTasteNarrative */
export function ensureMovieCoverageInNarrative(
	narrative: string,
	ratedMovies: number,
	topRatedMovies: TasteMovieHighlight[]
): string {
	return mergeFilmIntoTasteNarrative(narrative, ratedMovies, topRatedMovies);
}
