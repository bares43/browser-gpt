async function getItems() {
  const { menuItems } = await chrome.storage.local.get('menuItems');
  return menuItems || [];
}
async function setItems(items) {
  await chrome.storage.local.set({ menuItems: items });
}

let editIndex = null;

async function renderList() {
  const listEl = document.getElementById('list');
  listEl.innerHTML = '';
  const items = await getItems();

  // group prompts by category (empty → "No category")
  const groups = {};
  items.forEach((item, i) => {
    const cat = item.category && item.category.trim() || 'No category';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ item, i });
  });

  // render each category section
  Object.entries(groups).forEach(([cat, entries]) => {
    // category header
    const catLi = document.createElement('li');
    const catSpan = document.createElement('span');
    catSpan.textContent = cat;
    catSpan.style.fontWeight = 'bold';
    catLi.appendChild(catSpan);
    listEl.appendChild(catLi);

    // items under this category
    entries.forEach(({ item, i }) => {
      const li = document.createElement('li');
      li.style.marginLeft = '1em';
      const span = document.createElement('span');
      span.textContent = item.name;
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => startEdit(i, item));
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        const updated = items.filter((_, idx) => idx !== i);
        await setItems(updated);
        renderList();
      });
      li.append(span, editBtn, delBtn);
      listEl.appendChild(li);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const forContent = document.getElementById('forContent');
  const contentFields = document.getElementById('content-fields');

  function toggleContentFields() {
    contentFields.style.display = forContent.checked ? 'block' : 'none';
  }

  forContent.addEventListener('change', toggleContentFields);
  toggleContentFields();  // initial state
});

function startEdit(i, item) {
  editIndex = i;
  document.getElementById('name').value = item.name;
  document.getElementById('prompt').value = item.prompt;
  document.getElementById('category').value = item.category || '';
  document.getElementById('model').value = item.model;
  document.getElementById('forLink').checked = !!item.forLink;
  document.getElementById('forSelection').checked = !!item.forSelection;
  document.getElementById('forContent').checked = !!item.forContent;
  document.getElementById('selector').value = item.selector || '';
  document.getElementById('outputType').value = item.outputType || 'html';
  document.getElementById('maxItems').value = item.maxItems || '';
  document.getElementById('save-btn').textContent = 'Save Changes';
  document.getElementById('cancel-btn').style.display = 'inline';
  // ensure visibility
  document.getElementById('content-fields').style.display = item.forContent ? 'block' : 'none';
}

function cancelEdit() {
  editIndex = null;
  document.getElementById('form').reset();
  document.getElementById('selector').value = '';
  document.getElementById('outputType').value = 'html';
  document.getElementById('maxItems').value = '';
  document.getElementById('save-btn').textContent = 'Add Prompt';
  document.getElementById('cancel-btn').style.display = 'none';
  document.getElementById('forContent').checked = false;
  document.getElementById('content-fields').style.display = 'none';
}

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const prompt = document.getElementById('prompt').value.trim();
  const category = document.getElementById('category').value.trim();
  const model = document.getElementById('model').value;
  const forLink = document.getElementById('forLink').checked;
  const forSelection = document.getElementById('forSelection').checked;
  const forContent = document.getElementById('forContent').checked;
  const selector = document.getElementById('selector').value.trim();
  const outputType = document.getElementById('outputType').value;
  const maxItemsVal = document.getElementById('maxItems').value;
  const maxItems = maxItemsVal ? parseInt(maxItemsVal, 10) : undefined;
  if (!name || !prompt) return;

  const items = await getItems();
  const entry = { name, prompt, category, model, forLink, forSelection, forContent, selector, outputType, maxItems };
  if (editIndex !== null) items[editIndex] = entry;
  else items.push(entry);
  await setItems(items);
  cancelEdit();
  renderList();
});

document.getElementById('cancel-btn').addEventListener('click', cancelEdit);

renderList();
