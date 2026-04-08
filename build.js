const fs = require('fs');
const path = require('path');

// Your Google Sheet API URL
const SHEET_URL = 'https://opensheet.elk.sh/1QMyuVymXYTTgjaM_VQul_3BlrnRaDEaXj6EL6QgDE8k/WISDOME%20DATA%20BASE';
const SITE_URL = 'https://liberatica.netlify.app';

async function build() {
    console.log('Fetching books from Google Sheets...');
    try {
        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const rawBooks = await response.json();
        const books = rawBooks.map((book, index) => ({ ...book, id: index }));

        // 1. Create a /dist directory where the final site will live
        const distDir = path.join(__dirname, 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        // 2. Copy all your static assets (icons, index.html, robots.txt) into /dist
        const files = fs.readdirSync(__dirname);
        for (const file of files) {
            // Ignore build files and folders
            if (['node_modules', 'dist', 'build.js', 'package.json', 'package-lock.json', 'netlify.toml', 'sitemap.xml'].includes(file)) continue;
            
            // Only copy actual files, not hidden files or folders
            if (!file.startsWith('.') && fs.lstatSync(file).isFile()) {
                fs.copyFileSync(file, path.join(distDir, file));
            }
        }

        console.log('Pre-rendering main index.html for Googlebot...');
        let template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

        // Hardcode the first 24 books into the HTML so Googlebot reads them instantly
        let preRenderedGrid = books.slice(0, 24).map(book => `
            <div class="book-card" data-title="${escapeHtml(book.Title)}">
                <img src="${escapeHtml(book.Cover_url)}" alt="${escapeHtml(book.Title)}">
                <div class="book-content">
                    <div>
                        <h3>${escapeHtml(book.Title)}</h3>
                        <p class="author">${escapeHtml(book.Author)}</p>
                        <p class="category">${escapeHtml(book.Category)}</p>
                    </div>
                </div>
            </div>
        `).join('');
        
        let mainHtml = template.replace('<div class="book-grid" id="book-grid"></div>', `<div class="book-grid" id="book-grid">\n${preRenderedGrid}\n</div>`);
        fs.writeFileSync(path.join(distDir, 'index.html'), mainHtml);

        // 3. Generate individual static pages for EVERY book
        console.log('Generating individual book pages for Deep Linking & SEO...');
        const bookDir = path.join(distDir, 'book');
        if (!fs.existsSync(bookDir)) fs.mkdirSync(bookDir);

        let sitemapUrls = `<url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;

        for (const book of books) {
            if (!book.Title) continue; // Skip empty rows

            const idDir = path.join(bookDir, String(book.id));
            if (!fs.existsSync(idDir)) fs.mkdirSync(idDir);

            const bookUrl = `${SITE_URL}/book/${book.id}`;
            sitemapUrls += `<url><loc>${bookUrl}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;

            const safeTitle = escapeHtml(book.Title);
            const safeAuthor = escapeHtml(book.Author);
            const safeDesc = escapeHtml(`Read or download ${safeTitle} by ${safeAuthor} for free on Liberatica.`);
            const safeImage = escapeHtml(book.Cover_url);

            // Replace standard meta tags with Book-specific meta tags
            let bookHtml = template
                .replace(/<title[^>]*>.*?<\/title>/i, `<title id="dynamic-title">${safeTitle} by ${safeAuthor} | Liberatica</title>`)
                .replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${safeDesc}" id="dynamic-description">`)
                .replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${safeTitle} - Liberatica" id="og-title">`)
                .replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${safeDesc}" id="og-description">`)
                .replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${safeImage}" id="og-image">`)
                .replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${bookUrl}" id="og-url">`)
                .replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${safeTitle} - Liberatica" id="twitter-title">`)
                .replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${safeDesc}" id="twitter-description">`)
                .replace(/<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${safeImage}" id="twitter-image">`);

            // Inject a hidden text block so Googlebot can index the actual book details
            const seoBlock = `
                <div style="display:none;" id="seo-data">
                    <h1>${safeTitle}</h1>
                    <h2>by ${safeAuthor}</h2>
                    <p>Category: ${escapeHtml(book.Category)}</p>
                    <p>${safeDesc}</p>
                </div>
            `;
            bookHtml = bookHtml.replace('<body>', `<body>\n${seoBlock}`);

            fs.writeFileSync(path.join(idDir, 'index.html'), bookHtml);
        }

        // 4. Generate a comprehensive dynamic Sitemap
        console.log('Generating dynamic sitemap.xml...');
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}</urlset>`;
        fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap);

        console.log(`✅ Build Complete! Successfully pre-rendered ${books.length} books for SEO.`);
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Helper to prevent characters from breaking the HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

build();