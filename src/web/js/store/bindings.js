import { $ } from './dom.js';
import { scrollToSection } from './scroll.js';
import { cleanUid } from './format.js';
import { renderAll } from './render.js';
import { errorMessage } from './api.js';
import { state } from './state.js';
import { rememberOrder, saveLocal } from './storage.js';
import { closeAllModals, closeMenus, modal, toast } from './ui.js';
import { logout, openAccountMenu } from './features/account.js';
import { clearCart, closeDrawer, openDrawer } from './features/cart.js';
import { loadCatalog, selectTariff } from './features/catalog.js';
import {
  goToNextStep,
  preparePayment,
  resetCheckoutKey,
  startPayment,
} from './features/checkout.js';
import { revealStore, showEntryLanding } from './features/entry.js';
import { renderFavorites } from './features/favorites.js';
import { renderHistory, syncPurchaseHistory } from './features/history.js';
import { renderInvoice } from './features/invoice.js';
import { exportInvoice } from './features/invoice-export.js';
import { pollOrder, setCurrentOrder, stopPolling, syncOrder } from './features/orders.js';
import { finderSearch, onPlayerUidInput, resetPlayer, verifyPlayer } from './features/player.js';
import { closeSearch, openSearch, search } from './features/search.js';

const onEnter = (action) => (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    action();
  }
};

/** "Nueva factura": empieza un pedido nuevo (el anterior sigue guardado en el servidor). */
function startNewInvoice() {
  stopPolling();
  setCurrentOrder(null);
  rememberOrder(null);
  resetCheckoutKey();
  state.qty = {};
  state.playerUid = '';
  state.uidAccepted = false;
  state.playerLookup = null;
  state.customerName = '';
  state.customerEmail = '';
  $('playerUid').value = '';
  $('customerName').value = '';
  $('customerEmail').value = '';
  $('acceptTerms').checked = false;
  const result = $('playerResult');
  result.hidden = true;
  result.replaceChildren();
  saveLocal();
  renderAll();
  toast('Nueva factura creada.', 'good');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectPromoTariff() {
  selectTariff('promo');
  scrollToSection('catalogo');
}

async function copyInvoiceReference() {
  const r = state.currentOrder?.reference;
  if (!r) {
    toast('Aún no hay un pedido creado.');
    return;
  }
  try {
    await navigator.clipboard.writeText(r);
    toast('Referencia copiada.', 'good');
  } catch {
    toast('No fue posible copiar automáticamente.');
  }
}

async function refreshOrder() {
  const order = state.currentOrder;
  if (!order) {
    toast('Aún no existe un pedido.');
    return;
  }
  try {
    await syncOrder(order.reference);
    toast('Estado actualizado.', 'good');
  } catch (err) {
    toast(errorMessage(err, 'No se pudo actualizar el estado.'), 'bad');
  }
}

function bindEntryAndAccount() {
  $('enterStoreBtn').onclick = () => {
    closeMenus();
    $('entryExperience').classList.add('out');
    $('bootScreen')?.classList.add('out');
    modal('loginModal', true);
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
  $('menuFavorites').onclick = () => {
    closeMenus();
    renderFavorites();
    modal('favoritesModal', true);
  };
  $('menuNew').onclick = () => {
    closeMenus();
    $('newInvoiceBtn').click();
  };
  $('menuLogin').onclick = () => {
    closeMenus();
    modal('loginModal', true);
  };
  $('menuLogout').onclick = logout;
  $('accountBtn').onclick = (e) => {
    e.stopPropagation();
    if (state.session) openAccountMenu();
    else modal('loginModal', true);
  };
  $('guestBtn').onclick = () => {
    state.session = null;
    modal('loginModal', false);
    revealStore();
    toast('Compra como invitado habilitada.');
  };
  document.querySelectorAll('.oauth-btn').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (a.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        toast('Este acceso no está disponible por ahora.', 'bad');
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
  $('smartReview').onclick = goToNextStep;
  $('smartClear').onclick = clearCart;
  $('drawerClose').onclick = closeDrawer;
  $('drawerOverlay').onclick = closeDrawer;
  $('drawerReview').onclick = () => {
    closeDrawer();
    goToNextStep();
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
    onPlayerUidInput(e.target.value);
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
  };
  $('customerEmail').oninput = (e) => {
    state.customerEmail = e.target.value.trim();
  };
  $('paymentMethod').onchange = () => renderAll();
  $('payBtn').onclick = preparePayment;
  $('startPayment').onclick = startPayment;
  $('refreshOrderBtn').onclick = refreshOrder;
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
      closeAllModals();
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
  window.addEventListener('online', () => {
    toast('Conexión restaurada.', 'good');
    if (state.catalogStatus === 'error') loadCatalog(state.game);
    if (state.currentOrder) pollOrder();
  });
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
