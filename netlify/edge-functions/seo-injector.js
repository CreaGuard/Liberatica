export default async (request, context) => {
  const url = new URL(request.url);
  
  // Only intercept /book/ routes
  if (!url.pathname.startsWith("/book/")) {
    return context.next();
  }

  try {
    // 1. Get the book ID from the URL (e.g., /book/201 -> 201)
    const bookId = url.pathname.split("/")[2];
    if (!bookId) return context.next();

    // 2. Fetch the list of all books (Using Netlify's explicit Edge Cache for speed)
    const sheetUrl = 'https://opensheet.elk.sh/1QMyuVymXYTTgjaM_VQul_3BlrnRaDEaXj6EL6QgDE8k/WISDOME%20DATA%20BASE';
    const edgeCache = await caches.open('wisdometree-bot-cache');
    let cachedResponse = await edgeCache.match(sheetUrl);
    let books;

    if (cachedResponse) {
      books = await cachedResponse.json();
    } else {
      const sheetRes = await fetch(sheetUrl);
      if (sheetRes.ok) {
        await edgeCache.put(sheetUrl, sheetRes.clone());
        books = await sheetRes.json();
      } else {
        return context.next();
      }
    }

    // Ensure it's formatted properly and find the specific book
    books = Array.isArray(books) ? books.map((book, index) => ({ ...book, id: index })) : [];
    const book = books.find(b => b.id == bookId);

    if (!book) return context.next();

    // 3. Fetch the original index.html page
    const response = await context.next();
    let html = await response.text();

    // 4. Inject the book-specific meta tags using bulletproof RegEx
    const baseUrl = "https://liberatica.netlify.app/";
    const shareUrl = `${baseUrl}/book/${book.id}`;
    const description = `Read "${book.Title}" by ${book.Author} on Wisdometree. Category: ${book.Category}.`;

    // These regex patterns look specifically for the ID, ignoring spacing issues
    html = html
      .replace(/<title[^>]*>.*?<\/title>/i, `<title>${book.Title} by ${book.Author} | Wisdometree Library</title>`)
      .replace(/<meta[^>]*id="dynamic-description"[^>]*>/i, `<meta name="description" content="${description}" id="dynamic-description">`)
      .replace(/<meta[^>]*id="og-title"[^>]*>/i, `<meta property="og:title" content="${book.Title}" id="og-title">`)
      .replace(/<meta[^>]*id="og-description"[^>]*>/i, `<meta property="og:description" content="${description}" id="og-description">`)
      .replace(/<meta[^>]*id="og-image"[^>]*>/i, `<meta property="og:image" content="${book.Cover_url}" id="og-image">`)
      .replace(/<meta[^>]*id="og-url"[^>]*>/i, `<meta property="og:url" content="${shareUrl}" id="og-url">`)
      .replace(/<meta[^>]*id="twitter-title"[^>]*>/i, `<meta name="twitter:title" content="${book.Title}" id="twitter-title">`)
      .replace(/<meta[^>]*id="twitter-description"[^>]*>/i, `<meta name="twitter:description" content="${description}" id="twitter-description">`)
      .replace(/<meta[^>]*id="twitter-image"[^>]*>/i, `<meta name="twitter:image" content="${book.Cover_url}" id="twitter-image">`);

    // 5. Return the clean, modified HTML to the crawler (Fixes the compression header bug!)
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  } catch (error) {
    console.error("Error in Netlify edge function:", error);
    // If anything fails, safely serve the default page
    return context.next();
  }
};