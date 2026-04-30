// API配置
const API_CONFIG = {
    baseUrl: 'https://cold-rain-b291.9hgdx9js85.workers.dev/v1',
    model: 'Qwen/Qwen3.5-4B',
    textModel: 'Qwen/Qwen3-8B',
    apiKey: 'sk-phsbderuafguvtasueplhplknomicnrzirfonsmowrnbryao'
};

// 全局状态
let conversations = [];
let currentConversationId = null;
let isStreaming = false;
let abortController = null;
let historyStack = [];
let historyIndex = -1;
let isUserScrolling = false;
let lastScrollTop = 0;

// 初始化Markdown渲染器
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
});

// 本地存储管理
function saveToStorage() {
    try {
        const data = JSON.stringify(conversations);
        localStorage.setItem('ai-chat-conversations', data);
    } catch (e) {
        showToast('存储空间不足，请清理历史会话');
    }
}

function loadFromStorage() {
    const data = localStorage.getItem('ai-chat-conversations');
    if (data) {
        try {
            conversations = JSON.parse(data);
        } catch (e) {
            conversations = [];
        }
    }
    if (conversations.length === 0) {
        createNewConversation();
    }
}

function createNewConversation() {
    const conversation = {
        id: Date.now().toString(),
        title: '新会话',
        messages: [],
        createdAt: new Date().toISOString(),
        pinned: false
    };
    conversations.unshift(conversation);
    currentConversationId = conversation.id;
    saveToStorage();
    return conversation;
}

function getCurrentConversation() {
    return conversations.find(c => c.id === currentConversationId);
}

function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (currentConversationId === id) {
        if (conversations.length > 0) {
            currentConversationId = conversations[0].id;
        } else {
            createNewConversation();
        }
    }
    saveToStorage();
    renderConversationList();
    renderMessages();
}

function clearAllConversations() {
    if (confirm('确定要清空所有会话吗？此操作不可撤销。')) {
        conversations = [];
        createNewConversation();
        saveToStorage();
        renderConversationList();
        renderMessages();
    }
}

// 渲染侧边栏
function renderConversationList(filter = '') {
    const list = document.getElementById('conversation-list');
    const filtered = filter
        ? conversations.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
        : conversations;

    list.innerHTML = filtered.map(conv => `
        <div class="conversation-item ${conv.id === currentConversationId ? 'active' : ''} ${conv.pinned ? 'pinned' : ''}"
             data-id="${conv.id}">
            <span class="title">${escapeHtml(conv.title)}</span>
            <div class="actions">
                <button class="btn-icon pin-btn" title="置顶">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="17" x2="12" y2="22"></line>
                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                    </svg>
                </button>
                <button class="btn-icon rename-btn" title="重命名">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon delete-conv-btn" title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

    // 绑定事件
    list.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            switchConversation(item.dataset.id);
        });
    });

    list.querySelectorAll('.pin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.closest('.conversation-item').dataset.id;
            togglePin(id);
        });
    });

    list.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.closest('.conversation-item').dataset.id;
            renameConversation(id);
        });
    });

    list.querySelectorAll('.delete-conv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.closest('.conversation-item').dataset.id;
            deleteConversation(id);
        });
    });
}

function switchConversation(id) {
    if (isStreaming) {
        showToast('请等待当前回复完成');
        return;
    }
    currentConversationId = id;
    renderConversationList();
    renderMessages();
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
}

function togglePin(id) {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
        conv.pinned = !conv.pinned;
        conversations.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        saveToStorage();
        renderConversationList();
    }
}

function renameConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
        const newTitle = prompt('输入新名称:', conv.title);
        if (newTitle && newTitle.trim()) {
            conv.title = newTitle.trim();
            saveToStorage();
            renderConversationList();
        }
    }
}

function exportConversation() {
    const conv = getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
        showToast('当前会话无内容');
        return;
    }
    const text = conv.messages.map(m => `[${m.role === 'user' ? '用户' : 'AI'}] ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// 渲染消息
function renderMessages() {
    const container = document.getElementById('chat-messages');
    const conv = getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:2rem;">开始新的对话</div>';
        return;
    }

    container.innerHTML = conv.messages.map((msg, index) => {
        const content = msg.role === 'ai' ? marked.parse(msg.content) : escapeHtml(msg.content);
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const isLong = msg.content.length > 1000;
        const collapsedClass = isLong && !msg.expanded ? 'collapsed-content' : '';

        return `
            <div class="message ${msg.role}">
                <div class="message-bubble">
                    <div class="message-content ${collapsedClass}">${content}</div>
                    ${isLong ? `<span class="expand-btn" data-index="${index}">${msg.expanded ? '收起' : '展开全文'}</span>` : ''}
                </div>
                <div class="message-time">${time}</div>
                <div class="message-actions">
                    <button class="btn-icon copy-btn" data-index="${index}" title="复制">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    ${msg.role === 'ai' ? `
                    <button class="btn-icon regenerate-btn" data-index="${index}" title="重新生成">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1 4 1 10 7 10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                    </button>
                    ` : ''}
                    <button class="btn-icon quote-btn" data-index="${index}" title="引用回复">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // 绑定消息操作事件
    container.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const msg = conv.messages[parseInt(btn.dataset.index)];
            navigator.clipboard.writeText(msg.content).then(() => showToast('已复制'));
        });
    });

    container.querySelectorAll('.regenerate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            regenerateMessage(index);
        });
    });

    container.querySelectorAll('.quote-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const msg = conv.messages[parseInt(btn.dataset.index)];
            const input = document.getElementById('message-input');
            input.value = `> ${msg.content.substring(0, 100)}...\n\n`;
            input.focus();
        });
    });

    container.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            conv.messages[index].expanded = !conv.messages[index].expanded;
            saveToStorage();
            renderMessages();
            container.scrollTop = container.scrollHeight;
        });
    });

    // 代码高亮
    container.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });

    // 图片点击预览
    container.querySelectorAll('.message-content img').forEach(img => {
        img.addEventListener('click', () => {
            const modal = document.getElementById('image-modal');
            const modalImg = document.getElementById('modal-image');
            modal.style.display = 'flex';
            modalImg.src = img.src;
        });
    });
}

function regenerateMessage(index) {
    const conv = getCurrentConversation();
    if (!conv) return;
    // 找到该AI消息之前的用户消息
    let userMsgIndex = index - 1;
    while (userMsgIndex >= 0 && conv.messages[userMsgIndex].role !== 'user') {
        userMsgIndex--;
    }
    if (userMsgIndex < 0) return;

    const userMsg = conv.messages[userMsgIndex];
    // 删除从AI消息开始的所有后续消息
    conv.messages = conv.messages.slice(0, index);
    saveToStorage();
    renderMessages();
    sendMessage(userMsg.content);
}

// 发送消息
async function sendMessage(content) {
    if (isStreaming) return;
    if (!content.trim()) {
        showToast('请输入消息内容');
        return;
    }

    const conv = getCurrentConversation();
    if (!conv) return;

    // 添加用户消息
    const userMsg = {
        role: 'user',
        content: content,
        timestamp: Date.now()
    };
    conv.messages.push(userMsg);

    // 更新标题
    if (conv.title === '新会话' && conv.messages.length === 1) {
        conv.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    saveToStorage();
    renderConversationList();
    renderMessages();

    // 添加AI消息占位
    const aiMsg = {
        role: 'ai',
        content: '',
        timestamp: Date.now(),
        expanded: false
    };
    conv.messages.push(aiMsg);
    renderMessages();

    const chatContainer = document.getElementById('chat-messages');
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // 准备API请求
    const messages = [];
    const systemPrompt = document.getElementById('role-preset-select').value;
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    if (document.getElementById('memory-toggle').checked) {
        messages.push(...conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })));
    } else {
        messages.push({ role: 'user', content: content });
    }

    const temperature = parseFloat(document.getElementById('temperature-slider').value);
    const maxTokens = parseInt(document.getElementById('max-tokens-input').value);

    isStreaming = true;
    abortController = new AbortController();

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: API_CONFIG.model,
                messages: messages,
                stream: true,
                temperature: temperature,
                max_tokens: maxTokens
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                        break;
                    }
                    try {
                        const json = JSON.parse(data);
                        const delta = json.choices[0]?.delta?.content;
                        if (delta) {
                            conv.messages[conv.messages.length - 1].content += delta;
                            renderMessages();
                            if (!isUserScrolling) {
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            conv.messages[conv.messages.length - 1].content += '\n\n[输出已中断]';
        } else {
            conv.messages[conv.messages.length - 1].content += `\n\n[错误: ${error.message}]`;
        }
        renderMessages();
    } finally {
        isStreaming = false;
        abortController = null;
        saveToStorage();
    }
}

function stopStreaming() {
    if (abortController) {
        abortController.abort();
    }
}

// 图片处理
function handleImageUpload(files) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const conv = getCurrentConversation();
            if (!conv) return;
            conv.messages.push({
                role: 'user',
                content: `![图片](${e.target.result})`,
                timestamp: Date.now()
            });
            saveToStorage();
            renderMessages();
            // TODO: 实现图片识别功能
            showToast('图片已上传，识别功能开发中');
        };
        reader.readAsDataURL(file);
    });
}

// 粘贴图片处理
document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    Array.from(items).forEach(item => {
        if (item.type.startsWith('image/')) {
            imageFiles.push(item.getAsFile());
        }
    });
    if (imageFiles.length > 0) {
        e.preventDefault();
        handleImageUpload(imageFiles);
    }
});

// 辅助函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 加载数据
    loadFromStorage();
    renderConversationList();
    renderMessages();

    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');

    // 自动聚焦输入框
    messageInput.focus();

    // 新建会话
    document.getElementById('new-chat-btn').addEventListener('click', () => {
        if (isStreaming) {
            showToast('请等待当前回复完成');
            return;
        }
        createNewConversation();
        renderConversationList();
        renderMessages();
        messageInput.focus();
    });

    // 删除所有会话
    document.getElementById('delete-all-btn').addEventListener('click', clearAllConversations);

    // 侧边栏折叠
    document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // 主题切换
    document.getElementById('toggle-theme-btn').addEventListener('click', () => {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        body.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
        localStorage.setItem('theme', currentTheme === 'dark' ? 'light' : 'dark');
    });

    // 加载主题
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
    }

    // 发送消息
    sendBtn.addEventListener('click', () => {
        sendMessage(messageInput.value);
        messageInput.value = '';
        historyStack.push('');
        historyIndex = historyStack.length;
    });

    // 回车发送，Shift+回车换行
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(messageInput.value);
            historyStack.push(messageInput.value);
            historyIndex = historyStack.length;
            messageInput.value = '';
        } else if (e.key === 'ArrowUp' && !e.shiftKey) {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                messageInput.value = historyStack[historyIndex] || '';
            }
        } else if (e.key === 'ArrowDown' && !e.shiftKey) {
            e.preventDefault();
            if (historyIndex < historyStack.length - 1) {
                historyIndex++;
                messageInput.value = historyStack[historyIndex] || '';
            } else {
                historyIndex = historyStack.length;
                messageInput.value = '';
            }
        }
    });

    // 输入框自动调整高度
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });

    // 清空输入
    document.getElementById('clear-input-btn').addEventListener('click', () => {
        messageInput.value = '';
        messageInput.focus();
    });

    // 图片上传
    document.getElementById('upload-image-btn').addEventListener('click', () => {
        document.getElementById('image-file-input').click();
    });
    document.getElementById('image-file-input').addEventListener('change', (e) => {
        handleImageUpload(e.target.files);
        e.target.value = '';
    });

    // 设置按钮
    document.getElementById('settings-btn').addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'flex';
    });

    // 关闭模态框
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            closeBtn.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // 设置滑块
    document.getElementById('temperature-slider').addEventListener('input', (e) => {
        document.getElementById('temperature-value').textContent = e.target.value;
    });
    document.getElementById('font-size-slider').addEventListener('input', (e) => {
        const size = e.target.value;
        document.getElementById('font-size-value').textContent = size + 'px';
        document.documentElement.style.setProperty('--font-size-base', size + 'px');
    });

    // 导出会话
    document.getElementById('export-btn').addEventListener('click', exportConversation);

    // 回到顶部按钮
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    scrollTopBtn.addEventListener('click', () => {
        chatMessages.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 聊天区域滚动监听
    chatMessages.addEventListener('scroll', () => {
        const scrollTop = chatMessages.scrollTop;
        const scrollHeight = chatMessages.scrollHeight;
        const clientHeight = chatMessages.clientHeight;

        // 显示/隐藏回到顶部按钮
        scrollTopBtn.style.display = scrollTop > 300 ? 'flex' : 'none';

        // 检测用户是否主动上滑
        if (scrollTop < lastScrollTop - 10) {
            isUserScrolling = true;
        }

        // 如果用户滚到底部，恢复自动跟随
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            isUserScrolling = false;
        }

        lastScrollTop = scrollTop;
    });

    // 快捷键切换会话
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'ArrowUp') {
            e.preventDefault();
            const index = conversations.findIndex(c => c.id === currentConversationId);
            if (index > 0) {
                switchConversation(conversations[index - 1].id);
            }
        }
        if (e.ctrlKey && e.key === 'ArrowDown') {
            e.preventDefault();
            const index = conversations.findIndex(c => c.id === currentConversationId);
            if (index < conversations.length - 1) {
                switchConversation(conversations[index + 1].id);
            }
        }
    });

    // 搜索会话
    document.getElementById('search-input').addEventListener('input', (e) => {
        renderConversationList(e.target.value);
    });

    // 在移动端，点击消息区域关闭侧边栏
    if (window.innerWidth <= 768) {
        chatMessages.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
        });
    }
});

// 错误处理
window.addEventListener('error', (e) => {
    console.error('发生错误:', e.error);
    showToast('程序出现异常，请刷新页面重试');
});
