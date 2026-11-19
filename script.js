document.documentElement.classList.add('js-enabled');

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
const pendingReviewSection = document.querySelector('#pending-review-section');
const pendingReviewList = document.querySelector('#pending-review-list');
const reviewsPerPage = 3;
const reviewRotationInterval = 5000;
const manageReviewsButton = document.querySelector('#manage-reviews');
const adminSigninForm = document.querySelector('#admin-signin-form');
const adminSigninStatus = document.querySelector('#admin-signin-status');
const supabaseUrl = 'https://vzvkbzbmprfkrhdocajd.supabase.co';
const supabaseAnonKey = 'sb_publishable_dJBKahCCFmEBMnlxo1NOOg_iihaFvsb';
const supabaseClient = globalThis.supabase && !supabaseUrl.startsWith('YOUR_') && !supabaseAnonKey.startsWith('YOUR_')
  ? globalThis.supabase.createClient(supabaseUrl, supabaseAnonKey)
  : null;
const reviewDeleteAdminEmails = new Set([
  'ja_admin@info.co',
  'simiyuadvocate@yahoo.com'
]);
let reviewManagementEnabled = false;
let reviewApprovalEnabled = false;
let moderationSchemaAvailable = null;
let savedReviews = [];
let activeReviewPage = 0;
let reviewCarouselTimer;
let reviewCarouselPaused = false;
const blockedReviewTerms = new Set([
  'ass', 'asshole', 'bastard', 'bitch', 'blowjob', 'boobs', 'cock', 'cunt', 'dick',
  'fucker', 'fuckers', 'fucking', 'fucked', 'fuck', 'handjob', 'hentai', 'masturbate',
  'orgasm', 'penis', 'porn', 'prick', 'pussy', 'shit', 'shits', 'shitty', 'tits', 'vagina'
]);
const personalAttackTerms = new Set([
  'idiot', 'idiots', 'stupid', 'useless', 'liar', 'liars', 'scammer', 'scammers',
  'fraudster', 'fraudsters', 'crook', 'crooks', 'thief', 'thieves', 'incompetent',
  'moron', 'morons'
]);
const personalAttackPatterns = [
  /\b(?:fat|ugly|disgusting)[\s-]+(?:face|person|secretary|lawyer|advocate|staff|human)\b/
];
const seriousAllegationTerms = new Set([
  'fraud', 'fraudulent', 'scam', 'scammed', 'stole', 'stolen', 'theft', 'bribe',
  'bribery', 'corrupt', 'corruption', 'forgery', 'forged', 'counterfeit', 'criminal',
  'misconduct', 'malpractice', 'negligence', 'negligent', 'abuse', 'abused', 'abusive',
  'racist', 'racism', 'sexist', 'sexism'
]);
const seriousAllegationPatterns = [
  /\bembezzl[a-z]*\b/,
  /\bextort[a-z]*\b/,
  /\bblackmail[a-z]*\b/,
  /\blaunder[a-z]*\b/,
  /\bassault[a-z]*\b/,
  /\bharass[a-z]*\b/,
  /\bdiscriminat[a-z]*\b/
];
const threatPatterns = [
  /\b(?:i(?:\s+am|['’]m)?\s+going\s+to|i\s+will|i['’]ll|we\s+will|we['’]re\s+going\s+to)\s+(?:kill|hurt|attack|shoot|burn|bomb)\b/,
  /\b(?:kill|hurt|shoot|bomb)\s+(?:you|him|her|them|staff|lawyer|advocate)\b/,
  /\b(?:burn\s+down|blow\s+up|destroy)\s+(?:your|the)\s+(?:office|building|firm)\b/
];

function normalizeReviewText(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[013457@]/g, (character) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a' })[character]);
}

function findReviewModerationFlags(value) {
  const normalized = normalizeReviewText(value);
  const words = new Set(normalized.match(/[a-z]+/g) || []);
  const flags = [];

  if ([...blockedReviewTerms].some((word) => words.has(word))) flags.push('abusive language');
  if ([...personalAttackTerms].some((word) => words.has(word))
    || personalAttackPatterns.some((pattern) => pattern.test(normalized))) {
    flags.push('personal attack');
  }
  if ([...seriousAllegationTerms].some((word) => words.has(word))
    || seriousAllegationPatterns.some((pattern) => pattern.test(normalized))) {
    flags.push('serious allegation');
  }
  if (threatPatterns.some((pattern) => pattern.test(normalized))) flags.push('threat');

  return flags;
}

function isModerationSchemaMissing(error) {
  return error?.code === '42703' && /\breviews\.status\b/i.test(error.message || '');
}

function showModerationSchemaNotice() {
  reviewStatus.textContent = 'Flagged reviews are hidden until approved by the system administrator.';
}

function getReviewInitials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
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

  const pageCount = Math.ceil(savedReviews.length / reviewsPerPage);
  activeReviewPage %= pageCount;
  const pageOffset = activeReviewPage * reviewsPerPage;

  savedReviews.slice(pageOffset, pageOffset + reviewsPerPage).forEach((review, index) => {
    const article = document.createElement('article');
    article.className = 'published-review';
    article.setAttribute('role', 'group');
    article.setAttribute('aria-roledescription', 'slide');
    article.setAttribute('aria-label', `Testimonial ${pageOffset + index + 1} of ${savedReviews.length}`);

    const rating = document.createElement('p');
    rating.className = 'published-review-rating';
    rating.setAttribute('aria-label', `Rated ${review.rating} out of 5`);
    rating.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;

    const text = document.createElement('blockquote');
    text.textContent = review.review;

    const attribution = document.createElement('p');
    attribution.className = 'published-review-attribution';
    attribution.textContent = review.name;

    const avatar = document.createElement('span');
    avatar.className = 'published-review-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = getReviewInitials(review.name);

    const details = document.createElement('p');
    details.className = 'published-review-details';
    const date = new Date(review.createdAt);
    details.textContent = [review.service, Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)]
      .filter(Boolean)
      .join(' · ');

    const author = document.createElement('div');
    author.className = 'published-review-author';
    const authorCopy = document.createElement('div');
    authorCopy.className = 'published-review-author-copy';
    authorCopy.append(attribution, details);
    author.append(avatar, authorCopy);
    article.append(rating, text, author);

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

function startReviewCarousel() {
  window.clearInterval(reviewCarouselTimer);
  reviewCarouselTimer = undefined;

  if (savedReviews.length <= reviewsPerPage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  reviewCarouselTimer = window.setInterval(() => {
    if (reviewCarouselPaused) return;
    const pageCount = Math.ceil(savedReviews.length / reviewsPerPage);
    activeReviewPage = (activeReviewPage + 1) % pageCount;
    renderReviews();
  }, reviewRotationInterval);
}

publishedReviewList?.addEventListener('mouseenter', () => {
  reviewCarouselPaused = true;
});

publishedReviewList?.addEventListener('mouseleave', () => {
  reviewCarouselPaused = publishedReviewList.contains(document.activeElement);
});

publishedReviewList?.addEventListener('focusin', () => {
  reviewCarouselPaused = true;
});

publishedReviewList?.addEventListener('focusout', (event) => {
  if (!publishedReviewList.contains(event.relatedTarget)) reviewCarouselPaused = false;
});

manageReviewsButton?.addEventListener('click', async () => {
  if (!supabaseClient) {
    adminSigninStatus.textContent = 'Supabase is not configured. Check the project URL and public anon key in script.js.';
    return;
  }

  if (reviewManagementEnabled) {
    await supabaseClient.auth.signOut();
    reviewManagementEnabled = false;
    reviewApprovalEnabled = false;
    pendingReviewSection.hidden = true;
    pendingReviewList.replaceChildren();
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

    const isAdmin = data.user?.app_metadata?.role === 'admin';
    const email = String(data.user?.email ?? '').trim().toLowerCase();
    if (!isAdmin && !reviewDeleteAdminEmails.has(email)) {
      await supabaseClient.auth.signOut();
      adminSigninStatus.textContent = 'This account does not have review deletion access.';
      return;
    }

    reviewManagementEnabled = true;
    reviewApprovalEnabled = isAdmin;
    adminSigninForm.hidden = true;
    adminSigninForm.reset();
    manageReviewsButton.textContent = 'Sign out';
    manageReviewsButton.setAttribute('aria-expanded', 'true');
    reviewStatus.textContent = isAdmin
      ? 'Admin mode is on. You can approve or remove reviews.'
      : moderationSchemaAvailable
        ? 'Review deletion access is enabled. You can remove published reviews.'
        : 'Review deletion access is enabled. Apply the latest supabase-schema.sql in Supabase before deleting reviews.';
    renderReviews();
    pendingReviewSection.hidden = !reviewApprovalEnabled;
    if (reviewApprovalEnabled) await loadPendingReviews();
  } catch {
    adminSigninStatus.textContent = 'Could not reach Supabase. Check your connection and project URL, then try again.';
  } finally {
    submitButton.disabled = false;
  }
});

async function loadReviews() {
  if (!supabaseClient) {
    moderationSchemaAvailable = false;
    reviewStatus.textContent = 'Shared reviews are not configured yet. Add your Supabase project URL and public anon key in script.js.';
    return;
  }

  const { data: sampleData, error: sampleError } = await supabaseClient.from('reviews')
    .select('*')
    .limit(1);
  if (sampleError) {
    reviewStatus.textContent = 'Reviews could not be loaded. Check the Supabase setup and try again.';
    return;
  }

  if (sampleData.length) {
    moderationSchemaAvailable = Object.prototype.hasOwnProperty.call(sampleData[0], 'status');
  } else {
    const { error } = await supabaseClient.from('reviews').select('status').limit(1);
    if (isModerationSchemaMissing(error)) {
      moderationSchemaAvailable = false;
    } else if (error) {
      reviewStatus.textContent = 'Reviews could not be loaded. Check the Supabase setup and try again.';
      return;
    } else {
      moderationSchemaAvailable = true;
    }
  }

  let data;
  if (moderationSchemaAvailable) {
    const result = await supabaseClient.from('reviews')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(12);
    if (result.error) {
      reviewStatus.textContent = 'Reviews could not be loaded. Check the Supabase setup and try again.';
      return;
    }
    data = result.data;
  } else {
    const result = await supabaseClient.from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (result.error) {
      reviewStatus.textContent = 'Reviews could not be loaded. Check the Supabase setup and try again.';
      return;
    }
    data = result.data
      .filter((review) => !findReviewModerationFlags(`${review.name} ${review.review}`).length)
      .slice(0, 12);
  }

  savedReviews = data.map((review) => ({ ...review, createdAt: review.created_at }));
  activeReviewPage = 0;
  renderReviews();
  startReviewCarousel();
  if (!moderationSchemaAvailable) showModerationSchemaNotice();
}

async function loadPendingReviews() {
  const { data, error } = await supabaseClient.from('reviews')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    if (isModerationSchemaMissing(error)) {
      moderationSchemaAvailable = false;
      const notice = document.createElement('p');
      notice.className = 'pending-review-empty';
      notice.textContent = 'Apply supabase-schema.sql in Supabase to enable the approval queue.';
      pendingReviewList.replaceChildren(notice);
      showModerationSchemaNotice();
      return;
    }

    reviewStatus.textContent = 'Pending reviews could not be loaded. Confirm your admin access and try again.';
    return;
  }

  pendingReviewList.replaceChildren();
  if (!data.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'pending-review-empty';
    emptyMessage.textContent = 'No reviews are waiting for approval.';
    pendingReviewList.append(emptyMessage);
    return;
  }

  data.forEach((review) => {
    const article = document.createElement('article');
    article.className = 'pending-review';

    const avatar = document.createElement('span');
    avatar.className = 'published-review-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = getReviewInitials(review.name);

    const name = document.createElement('strong');
    name.textContent = review.name;

    const date = new Date(review.created_at);
    const details = document.createElement('p');
    details.className = 'published-review-details';
    details.textContent = [
      review.service,
      Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
    ].filter(Boolean).join(' · ');

    const attribution = document.createElement('div');
    attribution.className = 'pending-review-attribution';
    attribution.append(avatar, name);

    const text = document.createElement('p');
    text.className = 'pending-review-text';
    text.textContent = review.review;

    const actions = document.createElement('div');
    actions.className = 'pending-review-actions';
    ['approve', 'reject'].forEach((action) => {
      const button = document.createElement('button');
      button.className = 'review-action';
      button.type = 'button';
      button.dataset.reviewAction = action;
      button.dataset.reviewId = review.id;
      button.textContent = action === 'approve' ? 'Approve & publish' : 'Reject';
      button.setAttribute('aria-label', `${action === 'approve' ? 'Approve' : 'Reject'} review by ${review.name}`);
      actions.append(button);
    });

    article.append(attribution, details, text, actions);
    pendingReviewList.append(article);
  });
}

pendingReviewList?.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-review-action]');
  if (!actionButton || !reviewApprovalEnabled) return;

  const action = actionButton.dataset.reviewAction;
  if (action !== 'approve' && action !== 'reject') return;
  if (action === 'reject' && !window.confirm('Reject and permanently delete this review?')) return;
  actionButton.disabled = true;

  const result = action === 'approve'
    ? await supabaseClient.from('reviews').update({ status: 'published' })
      .eq('id', actionButton.dataset.reviewId).eq('status', 'pending')
    : await supabaseClient.from('reviews').delete()
      .eq('id', actionButton.dataset.reviewId).eq('status', 'pending');

  if (result.error) {
    reviewStatus.textContent = `The review could not be ${action === 'approve' ? 'approved' : 'rejected'}. Confirm your admin access and try again.`;
    actionButton.disabled = false;
    return;
  }

  reviewStatus.textContent = action === 'approve'
    ? 'The review was approved and published.'
    : 'The review was rejected and deleted.';
  await Promise.all([loadReviews(), loadPendingReviews()]);
});

publishedReviewList?.addEventListener('click', async (event) => {
  const removeButton = event.target.closest('.review-delete');
  if (!removeButton || !reviewManagementEnabled) return;
  if (!window.confirm('Remove this review for all visitors?')) return;

  const { error } = await supabaseClient.from('reviews').delete().eq('id', removeButton.dataset.reviewId);
  if (error) {
    reviewStatus.textContent = 'The review could not be removed. Apply the latest supabase-schema.sql and confirm this email has delete access.';
    return;
  }

  savedReviews = savedReviews.filter((review) => review.id !== removeButton.dataset.reviewId);
  renderReviews();
  startReviewCarousel();
  reviewStatus.textContent = 'The review was removed for all visitors.';
});

reviewForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!reviewForm.reportValidity()) return;

  const formData = new FormData(reviewForm);
  const name = String(formData.get('name')).trim();
  const reviewText = String(formData.get('review')).trim();
  const moderationFlags = findReviewModerationFlags(`${name} ${reviewText}`);

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

  if (moderationFlags.length && moderationSchemaAvailable !== true) {
    reviewStatus.textContent = 'This review needs admin approval, but moderation is not enabled yet. It was not submitted; please try again later.';
    return;
  }

  const { error } = await supabaseClient.from('reviews').insert(review);
  if (error) {
    reviewStatus.textContent = 'Your review could not be saved. Please try again later.';
    return;
  }

  await loadReviews();
  if (reviewApprovalEnabled) await loadPendingReviews();
  reviewForm.reset();
  reviewStatus.textContent = moderationFlags.length
    ? 'Your review was received and is awaiting admin approval before publication.'
    : moderationSchemaAvailable
      ? 'Your review was added and is visible to all visitors.'
      : 'Your review was added and is visible. Apply supabase-schema.sql in Supabase to enable review moderation.';
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
