/** Map book-catalog genre slugs to hard-coded movie catalog filters. */
export function bookGenreToMovieCatalogGenre(bookSlug: string): string {
	const s = bookSlug.toLowerCase().trim();
	const map: Record<string, string> = {
		adventure: 'action',
		fantasy: 'fantasy',
		mystery: 'thriller',
		thriller: 'thriller',
		horror: 'horror',
		romance: 'romance',
		'science fiction': 'sci-fi',
		'sci-fi': 'sci-fi',
		literary: 'drama',
		contemporary: 'drama',
		historical: 'drama',
		comedy: 'comedy',
		biography: 'documentary',
		nonfiction: 'documentary',
		'young adult': 'drama',
	};
	return map[s] ?? 'drama';
}

export function userHasMovieListActivity(movies: {
	completed?: unknown[];
	allTime?: unknown[];
	inProgress?: unknown[];
	planned?: unknown[];
}): boolean {
	return (
		(movies.completed?.length ?? 0) +
			(movies.allTime?.length ?? 0) +
			(movies.inProgress?.length ?? 0) +
			(movies.planned?.length ?? 0) >
		0
	);
}
