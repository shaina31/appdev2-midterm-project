const http = require('http');
const fs = require('fs');
const EventEmitter = require('events');
const url = require('url');

const PORT = 3002;
const todosFile = './todos.json';
const logFile = './logs.txt';

const logger = new EventEmitter();

logger.on('log', (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  
  try {
    fs.appendFileSync(logFile, logMessage, { flag: 'a' });
    console.log('Logged:', logMessage.trim());
  } catch (err) {
    console.error('Failed to log:', err);
  }
});

const readTodos = async () => {
  try {
    const data = await fs.promises.readFile(todosFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const writeTodos = async (todos) => {
  await fs.promises.writeFile(todosFile, JSON.stringify(todos, null, 2));
};

const getRequestBody = async (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  logger.emit('log', `${method} ${path}`);

  if (path.startsWith('/todos')) {
    const parts = path.split('/').filter(Boolean);
    const id = parts[1] ? parseInt(parts[1]) : null;

    try {
      let todos = await readTodos();

      if (method === 'GET' && parts.length === 1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(todos));
        return;
      }

      if (method === 'GET' && parts.length === 2) {
        const todo = todos.find(t => t.id === id);
        res.writeHead(todo ? 200 : 404);
        res.end(JSON.stringify(todo || { error: 'Todo not found' }));
        return;
      }

      if (method === 'POST' && parts.length === 1) {
        const data = await getRequestBody(req);
        if (!data.title) {
          res.writeHead(400);
          res.end('Missing title');
          return;
        }

        const newTodo = {
          id: todos.length ? Math.max(...todos.map(t => t.id)) + 1 : 1,
          title: data.title,
          completed: data.completed ?? false,
        };

        todos.push(newTodo);
        await writeTodos(todos);

        // Log the successful operation
        logger.emit('log', `POST Created: ${JSON.stringify(newTodo)}`);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newTodo));
        return;
      }

      if (method === 'PUT' && parts.length === 2) {
        const data = await getRequestBody(req);
        const index = todos.findIndex(t => t.id === id);

        if (index === -1) {
          res.writeHead(404);
          res.end('Todo not found');
          return;
        }

        todos[index] = { ...todos[index], ...data, id };
        await writeTodos(todos);

        // Log the update
        logger.emit('log', `PUT Updated: ${JSON.stringify(todos[index])}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(todos[index]));
        return;
      }

      if (method === 'DELETE' && parts.length === 2) {
        const index = todos.findIndex(t => t.id === id);

        if (index === -1) {
          res.writeHead(404);
          res.end('Todo not found');
          return;
        }

        const deletedTodo = todos.splice(index, 1)[0];
        await writeTodos(todos);

        // Log the deletion
        logger.emit('log', `DELETE Removed: ${JSON.stringify(deletedTodo)}`);

        res.writeHead(200);
        res.end(JSON.stringify(deletedTodo));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      console.error('Error:', err);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});