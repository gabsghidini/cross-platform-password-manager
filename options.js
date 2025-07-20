// Elementos DOM
const importFile = document.getElementById('import-file');
const importBtn = document.getElementById('import-btn');
const importStatus = document.getElementById('import-status');
const exportBtn = document.getElementById('export-btn');
const passwordList = document.getElementById('password-list');

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
  renderPasswords();
  setupEventListeners();
});

function setupEventListeners() {
  // Importação de senhas
  importFile.addEventListener('change', function() {
    importBtn.disabled = !this.files.length;
    importStatus.textContent = '';
  });

  importBtn.addEventListener('click', importPasswords);
  exportBtn.addEventListener('click', exportPasswords);
}

function importPasswords() {
  const file = importFile.files[0];
  if (!file) {
    showStatus('Selecione um arquivo primeiro.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const fileContent = e.target.result;
      let importedData;

      // Detectar o tipo de arquivo baseado na extensão e conteúdo
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

      // Importar senhas
      chrome.storage.sync.get({passwords: []}, function(data) {
        const existingPasswords = data.passwords;
        let addedCount = 0;
        let duplicateCount = 0;

        importedData.forEach(newPassword => {
          // Verificar duplicatas (mesmo site e usuário)
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

        // Salvar senhas atualizadas
        chrome.storage.sync.set({passwords: existingPasswords}, function() {
          let message = `${addedCount} senhas importadas com sucesso.`;
          if (duplicateCount > 0) {
            message += ` ${duplicateCount} duplicatas ignoradas.`;
          }
          showStatus(message, 'success');
          renderPasswords();
          
          // Limpar input
          importFile.value = '';
          importBtn.disabled = true;
        });
      });

    } catch (error) {
      showStatus(`Erro ao importar: ${error.message}`, 'error');
    }
  };

  reader.onerror = function() {
    showStatus('Erro ao ler o arquivo.', 'error');
  };

  reader.readAsText(file);
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

    // Usar o nome do website como site principal, e URL como fallback
    let site = websiteName || websiteUrl;
    
    // Se temos URL, extrair o domínio para usar como site
    if (websiteUrl && !websiteName) {
      try {
        const url = new URL(websiteUrl);
        site = url.hostname;
      } catch (e) {
        site = websiteUrl;
      }
    }

    // Validar se temos os campos obrigatórios
    if (site && login && password) {
      passwords.push({
        site: site,
        user: login,
        pass: password
      });
    }
  });

  return passwords;
}

function isTextFormat(content) {
  // Verificar se o conteúdo contém os padrões típicos do formato de texto
  return content.includes('Website name:') || 
         content.includes('Website URL:') || 
         content.includes('Login:') || 
         content.includes('Password:');
}

function exportPasswords() {
  chrome.storage.sync.get({passwords: []}, function(data) {
    if (data.passwords.length === 0) {
      showStatus('Nenhuma senha para exportar.', 'error');
      return;
    }

    // Criar arquivo JSON
    const dataStr = JSON.stringify(data.passwords, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    // Criar link de download
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senhas_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    // Fazer download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Limpar URL
    URL.revokeObjectURL(url);
    
    showStatus(`${data.passwords.length} senhas exportadas com sucesso.`, 'success');
  });
}

function renderPasswords() {
  chrome.storage.sync.get({passwords: []}, function(data) {
    passwordList.innerHTML = '';
    
    if (data.passwords.length === 0) {
      passwordList.innerHTML = '<p class="no-passwords">Nenhuma senha salva ainda.</p>';
      return;
    }

    data.passwords.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'password-item';
      div.innerHTML = `
        <div class="password-info">
          <strong>${escapeHtml(item.site)}</strong>
          <span class="username">${escapeHtml(item.user)}</span>
        </div>
        <div class="password-actions">
          <button class="copy-btn" data-idx="${idx}">Copiar Senha</button>
          <button class="delete-btn" data-idx="${idx}">Excluir</button>
        </div>
      `;
      passwordList.appendChild(div);
    });

    // Adicionar event listeners para botões
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.getAttribute('data-idx'));
        const password = data.passwords[idx].pass;
        
        navigator.clipboard.writeText(password).then(() => {
          const originalText = this.textContent;
          this.textContent = 'Copiado!';
          this.disabled = true;
          
          setTimeout(() => {
            this.textContent = originalText;
            this.disabled = false;
          }, 1000);
        }).catch(() => {
          showStatus('Erro ao copiar senha.', 'error');
        });
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.getAttribute('data-idx'));
        const password = data.passwords[idx];
        
        if (confirm(`Tem certeza que deseja excluir a senha para ${password.site}?`)) {
          deletePassword(idx);
        }
      });
    });
  });
}

function deletePassword(index) {
  chrome.storage.sync.get({passwords: []}, function(data) {
    const passwords = data.passwords;
    passwords.splice(index, 1);
    
    chrome.storage.sync.set({passwords}, function() {
      showStatus('Senha excluída com sucesso.', 'success');
      renderPasswords();
    });
  });
}

function showStatus(message, type) {
  importStatus.textContent = message;
  importStatus.className = `status ${type}`;
  
  // Limpar status após 5 segundos
  setTimeout(() => {
    importStatus.textContent = '';
    importStatus.className = '';
  }, 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
