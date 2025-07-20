document.getElementById('add-password').onclick = function() {
  const site = prompt('Site:');
  const user = prompt('Usuário:');
  const pass = prompt('Senha:');
  if (site && user && pass) {
    chrome.storage.local.get({passwords: []}, function(data) {
      const passwords = data.passwords;
      passwords.push({site, user, pass});
      chrome.storage.local.set({passwords}, function() {
        renderPasswords();
      });
    });
  }
};

let allPasswords = [];
let currentSearch = '';

function renderPasswords() {
  chrome.storage.local.get({passwords: []}, function(data) {
    allPasswords = data.passwords;
    showPasswordsFiltered();
  });
}

function showPasswordsFiltered() {
  const list = document.getElementById('password-list');
  list.innerHTML = '';
  const search = currentSearch.trim().toLowerCase();
  let filtered = allPasswords;
  if (search) {
    filtered = allPasswords.filter(item =>
      item.site.toLowerCase().includes(search) ||
      item.user.toLowerCase().includes(search)
    );
  }
  if (filtered.length === 0) {
    list.innerHTML = '<p class="no-passwords">Nenhuma senha encontrada.</p>';
    return;
  }
  filtered.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'password-item';
    div.innerHTML = `<b>${item.site}</b> | ${item.user} <button data-idx="${idx}" class="copy">Copiar</button>`;
    list.appendChild(div);
  });
  document.querySelectorAll('.copy').forEach(btn => {
    btn.onclick = function() {
      // idx do array filtrado pode ser diferente do allPasswords
      const idx = this.getAttribute('data-idx');
      const pass = filtered[idx].pass;
      navigator.clipboard.writeText(pass);
      this.textContent = 'Copiado!';
      setTimeout(() => this.textContent = 'Copiar', 1000);
    };
  });
}
// Evento de busca
const searchBar = document.getElementById('search-bar');
if (searchBar) {
  searchBar.addEventListener('input', function() {
    currentSearch = this.value;
    showPasswordsFiltered();
  });
}


// Importação de senhas por arquivo no popup
const popupImportFile = document.getElementById('popup-import-file');
const popupImportBtn = document.getElementById('popup-import-btn');
const popupImportStatus = document.getElementById('popup-import-status');

if (popupImportFile && popupImportBtn && popupImportStatus) {
  popupImportFile.addEventListener('change', function() {
    popupImportBtn.disabled = !this.files.length;
    popupImportStatus.textContent = '';
  });

  popupImportBtn.addEventListener('click', function() {
    const file = popupImportFile.files[0];
    if (!file) {
      showPopupStatus('Selecione um arquivo primeiro.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const fileContent = e.target.result;
        let importedData;
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.json')) {
          importedData = parseJsonFormat(fileContent);
        } else if (fileName.endsWith('.txt') || isTextFormat(fileContent)) {
          importedData = parseTextFormat(fileContent);
        } else {
          throw new Error('Formato de arquivo não suportado. Use arquivos .json ou .txt');
        }
        if (importedData.length === 0) {
          throw new Error('Nenhuma senha válida encontrada no arquivo');
        }
        chrome.storage.local.get({passwords: []}, function(data) {
          const existingPasswords = data.passwords;
          let addedCount = 0;
          let duplicateCount = 0;
          importedData.forEach(newPassword => {
            const isDuplicate = existingPasswords.some(existing =>
              existing.site.toLowerCase() === newPassword.site.toLowerCase() &&
              existing.user.toLowerCase() === newPassword.user.toLowerCase()
            );
            if (!isDuplicate) {
              existingPasswords.push(newPassword);
              addedCount++;
            } else {
              duplicateCount++;
            }
          });
          chrome.storage.local.set({passwords: existingPasswords}, function() {
            let message = `${addedCount} senhas importadas com sucesso.`;
            if (duplicateCount > 0) {
              message += ` ${duplicateCount} duplicatas ignoradas.`;
            }
            showPopupStatus(message, 'success');
            renderPasswords();
            popupImportFile.value = '';
            popupImportBtn.disabled = true;
          });
        });
      } catch (error) {
        showPopupStatus(`Erro ao importar: ${error.message}`, 'error');
      }
    };
    reader.onerror = function() {
      showPopupStatus('Erro ao ler o arquivo.', 'error');
    };
    reader.readAsText(file);
  });
}

function showPopupStatus(message, type) {
  popupImportStatus.textContent = message;
  popupImportStatus.style.color = type === 'success' ? '#155724' : '#721c24';
  popupImportStatus.style.background = type === 'success' ? '#d4edda' : '#f8d7da';
  popupImportStatus.style.border = '1px solid ' + (type === 'success' ? '#c3e6cb' : '#f5c6cb');
  popupImportStatus.style.padding = '6px';
  popupImportStatus.style.borderRadius = '3px';
  setTimeout(() => {
    popupImportStatus.textContent = '';
    popupImportStatus.style = '';
  }, 5000);
}

function parseJsonFormat(content) {
  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error('Formato JSON inválido: esperado um array de senhas');
  }
  return data.filter(item => {
    return item &&
      typeof item.site === 'string' &&
      typeof item.user === 'string' &&
      typeof item.pass === 'string' &&
      item.site.trim() !== '' &&
      item.user.trim() !== '' &&
      item.pass.trim() !== '';
  }).map(item => ({
    site: item.site.trim(),
    user: item.user.trim(),
    pass: item.pass.trim()
  }));
}

function parseTextFormat(content) {
  const passwords = [];
  const entries = content.split('---').filter(entry => entry.trim());
  entries.forEach(entry => {
    const lines = entry.split('\n').map(line => line.trim()).filter(line => line);
    let websiteName = '';
    let websiteUrl = '';
    let login = '';
    let password = '';
    lines.forEach(line => {
      if (line.startsWith('Website name:')) {
        websiteName = line.replace('Website name:', '').trim();
      } else if (line.startsWith('Website URL:')) {
        websiteUrl = line.replace('Website URL:', '').trim();
      } else if (line.startsWith('Login:')) {
        login = line.replace('Login:', '').trim();
      } else if (line.startsWith('Password:')) {
        password = line.replace('Password:', '').trim();
      }
    });
    let site = websiteName || websiteUrl;
    if (websiteUrl && !websiteName) {
      try {
        const url = new URL(websiteUrl);
        site = url.hostname;
      } catch (e) {
        site = websiteUrl;
      }
    }
    if (site && login && password) {
      passwords.push({ site, user: login, pass: password });
    }
  });
  return passwords;
}

function isTextFormat(content) {
  return content.includes('Website name:') ||
    content.includes('Website URL:') ||
    content.includes('Login:') ||
    content.includes('Password:');
}

renderPasswords();
