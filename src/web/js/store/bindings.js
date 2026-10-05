import { $ } from './dom.js';
import { cleanUid } from './format.js';
import { renderAll } from './render.js';
import { runtime, state } from './state.js';
import { nextInvoice, saveLocal } from './storage.js';
import { closeMenus, modal, toast } from './ui.js';
import { login, logout, openAccountMenu, switchAuthMode } from './features/account.js';
import { clearCart, closeDrawer, openDrawer } from './features/cart.js';
import { loadCatalog, selectTariff } from './features/catalog.js';
import { preparePayment, startWompi } from './features/checkout.js';
import { revealStore, showEntryLanding } from './features/entry.js';
import { renderFavorites } from './features/favorites.js';
import { renderHistory, syncPurchaseHistory } from './features/history.js';
import { renderInvoice } from './features/invoice.js';
import { exportInvoice } from './features/invoice-export.js';
import { pollOrder } from './features/orders.js';
import { finderSearch, resetPlayer, verifyPlayer } from './features/player.js';
import { closeSearch, openSearch, search } from './features/search.js';

const scrollToSection = (id) => $(id).scrollIntoView({ behavior: 'smooth' });

const onEnter = (action) => (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    action();
  }
};

function startNewInvoice() {
  clearInterval(runtime.pollTimer);
  state.invoice = nextInvoice();
  state.qty = {};
  state.playerUid = '';
  state.nickname = '';
  state.region = '';
  state.regionLabel = '';
  state.verified = false;
  state.customerName = '';
  state.customerEmail = '';
  state.currentOrder = null;
  state.checkout = null;
  runtime.checkoutConfig = null;
  $('playerUid').value = '';
  $('customerName').value = '';
  $('customerEmail').value = '';
  $('acceptTerms').checked = false;
  renderAll();
  toast('Nueva factura creada.', 'good');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectPromoTariff() {
  selectTariff('promo');
  scrollToSection('catalogo');
}

async function copyInvoiceReference() {
  const r = $('invoiceRef').textContent;
  if (!r) return;
  try {
    await navigator.clipboard.writeText(r);
    toast('Referencia copiada.', 'good');
  } catch {
    toast('No fue posible copiar automáticamente.');
  }
}

function bindEntryAndAccount() {
  $('enterStoreBtn').onclick = () => {
    closeMenus();
    $('loginError').classList.remove('show');
    $('entryExperience').classList.add('out');
    $('bootScreen')?.classList.add('out');
    modal('loginModal', true);
    setTimeout(() => $('loginEmail')?.focus(), 80);
  };
  $('menuInvoice').onclick = () => {
    closeMenus();
    scrollToSection('factura');
  };
  $('menuHistory').onclick = async () => {
    closeMenus();
    renderHistory();
    modal('historyModal', true);
    await syncPurchaseHistory();
  };
  $('menuNew').onclick = () => {
    closeMenus();
    $('newInvoiceBtn').click();
  };
  $('menuLogin').onclick = () => {
    closeMenus();
    $('loginError').classList.remove('show');
    modal('loginModal', true);
  };
  $('menuLogout').onclick = logout;
  $('accountBtn').onclick = (e) => {
    e.stopPropagation();
    if (state.session) openAccountMenu();
    else modal('loginModal', true);
  };
  $('loginForm').onsubmit = login;
  $('switchAuthMode').onclick = switchAuthMode;
  $('guestBtn').onclick = () => {
    state.session = null;
    modal('loginModal', false);
    revealStore();
    toast('Compra como invitado habilitada.');
  };
  document.querySelectorAll('.oauth-btn').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (state.localDemo) {
        e.preventDefault();
        toast('El acceso social se activa al ejecutar TayGameStore con su backend.', 'bad');
        return;
      }
      if (a.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        toast('Este proveedor no está configurado en el backend.', 'bad');
      }
    }),
  );
}

function bindCatalogAndCart() {
  document.querySelectorAll('.game-tab').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (btn.dataset.game !== 'freefire') {
        toast('Este juego llegará próximamente.', 'bad');
        return;
      }
      state.game = 'freefire';
      state.qty = {};
      resetPlayer(true);
      renderAll();
      await loadCatalog('freefire');
      renderAll();
    }),
  );
  document
    .querySelectorAll('.tariff-toggle button')
    .forEach((btn) => btn.addEventListener('click', () => selectTariff(btn.dataset.tariff)));
  $('smartReview').onclick = () => scrollToSection('factura');
  $('smartClear').onclick = clearCart;
  $('drawerClose').onclick = closeDrawer;
  $('drawerOverlay').onclick = closeDrawer;
  $('drawerReview').onclick = () => {
    closeDrawer();
    scrollToSection('factura');
  };
  $('drawerClear').onclick = clearCart;
  $('cartBtn').onclick = openDrawer;
  $('favoritesBtn').onclick = () => {
    renderFavorites();
    modal('favoritesModal', true);
  };
  $('promoBtn').onclick = () => {
    selectPromoTariff();
    toast('Tarifa promo seleccionada.');
  };
  $('activatePromo').onclick = () => {
    modal('promoModal', false);
    selectPromoTariff();
    toast('Tarifa promo seleccionada.', 'good');
  };
}

function bindPlayer() {
  $('playerUid').oninput = (e) => {
    e.target.value = cleanUid(e.target.value);
  };
  $('playerUid').onkeydown = onEnter(verifyPlayer);
  $('verifyBtn').onclick = verifyPlayer;
  $('playerFinderBtn').onclick = () => {
    modal('playerFinderModal', true);
    setTimeout(() => $('finderUid').focus(), 20);
  };
  $('finderSearchBtn').onclick = finderSearch;
  $('finderUid').oninput = (e) => (e.target.value = cleanUid(e.target.value));
  $('finderUid').onkeydown = onEnter(finderSearch);
}

function bindInvoiceAndCheckout() {
  $('customerName').oninput = (e) => {
    state.customerName = e.target.value;
    renderInvoice();
    saveLocal();
  };
  $('customerEmail').oninput = (e) => {
    state.customerEmail = e.target.value.trim();
    saveLocal();
  };
  $('paymentMethod').onchange = (e) => {
    if (e.target.value !== 'wompi') state.checkout = null;
    renderAll();
  };
  $('payBtn').onclick = preparePayment;
  $('startPayment').onclick = startWompi;
  $('refreshOrderBtn').onclick = async () => {
    if (state.currentOrder) {
      const done = await pollOrder();
      toast(done ? 'Estado actualizado.' : 'Consulta actualizada.', 'good');
    } else toast('Aún no existe una orden de servidor.');
  };
  $('newInvoiceBtn').onclick = startNewInvoice;
  $('copyRefBtn').onclick = copyInvoiceReference;
  $('jpgBtn').onclick = () => exportInvoice('jpg');
  $('pdfBtn').onclick = () => exportInvoice('pdf');
  $('shareBtn').onclick = () => exportInvoice('share');
  $('howBtn').onclick = () => modal('howModal', true);
  $('securityBtn').onclick = () => modal('securityModal', true);
}

function bindGlobal() {
  $('searchBtn').onclick = () => {
    closeMenus();
    openSearch();
  };
  $('closeSearch').onclick = closeSearch;
  $('searchInput').oninput = search;
  document.querySelectorAll('[data-close]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const target = btn.dataset.close;
      modal(target, false);
      if (target === 'loginModal' && !state.storeUnlocked) showEntryLanding();
    }),
  );
  document.querySelectorAll('.modal').forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        const wasEntry = m.id === 'loginModal' && !state.storeUnlocked;
        modal(m.id, false);
        if (wasEntry) showEntryLanding();
      }
    }),
  );
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#accountMenu') && !e.target.closest('#accountBtn')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const wasEntry =
        !state.storeUnlocked && !!document.querySelector('#loginModal:not([hidden])');
      closeDrawer();
      closeSearch();
      document.querySelectorAll('.modal').forEach((m) => (m.hidden = true));
      if (wasEntry) showEntryLanding();
      else document.body.classList.remove('lock');
    }
    if (
      e.key === '/' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    ) {
      e.preventDefault();
      openSearch();
    }
  });
  window.addEventListener('online', () => toast('Conexión restaurada.', 'good'));
  window.addEventListener('offline', () => toast('Navegador sin conexión.', 'bad'));
  try {
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [f] })) $('shareBtn').hidden = false;
  } catch {
    // Web Share API no disponible: el botón de compartir sigue oculto.
  }
}

/** Conecta los controles de la página con sus acciones. */
export function bind() {
  bindEntryAndAccount();
  bindCatalogAndCart();
  bindPlayer();
  bindInvoiceAndCheckout();
  bindGlobal();
}
