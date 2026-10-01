const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const reviewForm = document.querySelector('#review-form');
const reviewStatus = document.querySelector('#review-status');
const publishedReviewList = document.querySelector('#published-review-list');
const manageReviewsButton = document.querySelector('#manage-reviews');
const adminSigninForm = document.querySelector('#admin-signin-form');
const adminSigninStatus = document.querySelector('#admin-signin-status');
const supabaseUrl = 'https://vzvkbzbmprfkrhdocajd.supabase.co';
const supabaseAnonKey = 'sb_publishable_dJBKahCCFmEBMnlxo1NOOg_iihaFvsb';
const supabaseClient = globalThis.supabase && !supabaseUrl.startsWith('YOUR_') && !supabaseAnonKey.startsWith('YOUR_')
  ? globalThis.supabase.createClient(supabaseUrl, supabaseAnonKey)
  : null;
let reviewManagementEnabled = false;
let savedReviews = [];
const blockedReviewTerms = new Set([
  'ass', 'asshole', 'bastard', 'bitch', 'blowjob', 'boobs', 'cock', 'cunt', 'dick',
  'fucker', 'fuckers', 'fucking', 'fucked', 'fuck', 'handjob', 'hentai', 'masturbate',
  'orgasm', 'penis', 'porn', 'prick', 'pussy', 'shit', 'shits', 'shitty', 'tits', 'vagina'
]);

function findBlockedTerm(value) {
  const words = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[013457@]/g, (character) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a' })[character])
    .match(/[a-z]+/g) || [];

  return words.find((word) => blockedReviewTerms.has(word));
}

function renderReviews() {
  publishedReviewList.replaceChildren();

  if (!savedReviews.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'published-review-empty';
    emptyMessage.textContent = 'No reviews yet. Be the first to share your experience.';
    publishedReviewList.append(emptyMessage);
    return;
  }

  savedReviews.forEach((review) => {
    const article = document.createElement('article');
    article.className = 'published-review';

    const rating = document.createElement('p');
    rating.className = 'published-review-rating';
    rating.setAttribute('aria-label', `Rated ${review.rating} out of 5`);
    rating.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;

    const text = document.createElement('blockquote');
    text.textContent = review.review;

    const attribution = document.createElement('p');
    attribution.className = 'published-review-attribution';
    attribution.textContent = review.name;

    const details = document.createElement('p');
    details.className = 'published-review-details';
    const date = new Date(review.createdAt);
    details.textContent = [review.service, Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)]
      .filter(Boolean)
      .join(' · ');

    article.append(rating, text, attribution, details);

    const removeButton = document.createElement('button');
    removeButton.className = 'review-delete';
    removeButton.type = 'button';
    removeButton.dataset.reviewId = review.id;
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', `Remove review by ${review.name} for all visitors`);
    removeButton.hidden = !reviewManagementEnabled;
    article.append(removeButton);

    publishedReviewList.append(article);
  });

}

manageReviewsButton?.addEventListener('click', async () => {
  if (!supabaseClient) {
    adminSigninStatus.textContent = 'Supabase is not configured. Check the project URL and public anon key in script.js.';
    return;
  }

  if (reviewManagementEnabled) {
    await supabaseClient.auth.signOut();
    reviewManagementEnabled = false;
    manageReviewsButton.textContent = 'Admin sign in';
    manageReviewsButton.setAttribute('aria-expanded', 'false');
    renderReviews();
    return;
  }

  adminSigninForm.hidden = !adminSigninForm.hidden;
  adminSigninStatus.textContent = '';
  manageReviewsButton.setAttribute('aria-expanded', String(!adminSigninForm.hidden));
});

adminSigninForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabaseClient || !adminSigninForm.reportValidity()) return;

  const formData = new FormData(adminSigninForm);
  const submitButton = adminSigninForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  adminSigninStatus.textContent = 'Signing in...';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: String(formData.get('email')).trim(),
      password: String(formData.get('password'))
    });

    if (error) {
      adminSigninStatus.textContent = `Sign-in failed: ${error.message}`;
      return;
    }

    if (data.user?.app_metadata?.role !== 'admin') {
      await supabaseClient.auth.signOut();
      adminSigninStatus.textContent = 'This account signed in but lacks admin access. Set app_metadata.role to admin in Supabase, then sign in again.';
      return;
    }

    reviewManagementEnabled = true;
    adminSigninForm.hidden = true;
    adminSigninForm.reset();
    manageReviewsButton.textContent = 'Sign out';
    manageReviewsButton.setAttribute('aria-expanded', 'true');
    reviewStatus.textContent = 'Admin mode is on. You can now remove inappropriate reviews.';
    renderReviews();
  } catch {
    adminSigninStatus.textContent = 'Could not reach Supabase. Check your connection and project URL, then try again.';
  } finally {
    submitButton.disabled = false;
  }
});

async function loadReviews() {
  if (!supabaseClient) {
    reviewStatus.textContent = 'Shared reviews are not configured yet. Add your Supabase project URL and public anon key in script.js.';
    return;
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const { data, error } = await supabaseClient.from('reviews')
    .select('*')
    .gte('created_at', sixMonthsAgo.toISOString())
    .lte('created_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    reviewStatus.textContent = 'Reviews could not be loaded. Check the Supabase setup and try again.';
    return;
  }

  savedReviews = data.map((review) => ({ ...review, createdAt: review.created_at }));
  renderReviews();
}

publishedReviewList?.addEventListener('click', async (event) => {
  const removeButton = event.target.closest('.review-delete');
  if (!removeButton || !reviewManagementEnabled) return;
  if (!window.confirm('Remove this review for all visitors?')) return;

  const { error } = await supabaseClient.from('reviews').delete().eq('id', removeButton.dataset.reviewId);
  if (error) {
    reviewStatus.textContent = 'The review could not be removed. Confirm your admin access and try again.';
    return;
  }

  savedReviews = savedReviews.filter((review) => review.id !== removeButton.dataset.reviewId);
  renderReviews();
  reviewStatus.textContent = 'The review was removed for all visitors.';
});

reviewForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!reviewForm.reportValidity()) return;

  const formData = new FormData(reviewForm);
  const name = String(formData.get('name')).trim();
  const reviewText = String(formData.get('review')).trim();
  const blockedTerm = findBlockedTerm(`${name} ${reviewText}`);

  if (blockedTerm) {
    reviewStatus.textContent = 'Please remove profanity or sexually explicit language before submitting.';
    return;
  }

  const review = {
    name,
    service: String(formData.get('service')),
    rating: Number(formData.get('rating')),
    review: reviewText
  };

  if (!supabaseClient) {
    reviewStatus.textContent = 'Reviews are not available yet. Shared review storage has not been configured.';
    return;
  }

  const { error } = await supabaseClient.from('reviews').insert(review);
  if (error) {
    reviewStatus.textContent = 'Your review could not be saved. Please try again later.';
    return;
  }

  await loadReviews();
  reviewForm.reset();
  reviewStatus.textContent = 'Your review was added and is visible to all visitors.';
});

if (publishedReviewList) loadReviews();

if (window.gsap && window.ScrollTrigger) {
  document.documentElement.classList.add('gsap-ready');
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray('.reveal').forEach((element) => {
    gsap.to(element, {
      y: 0,
      opacity: 1,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: element, start: 'top 86%', once: true }
    });
  });
  gsap.from('.hero-image-wrap', { scale: 1.08, duration: 1.4, ease: 'power3.out' });
  gsap.from('.hero-stamp', { rotation: 18, opacity: 0, duration: 1.2, delay: .4, ease: 'back.out(1.5)' });
}
