import express from 'express';
import fileUpload from 'express-fileupload';
import exphbs from 'express-handlebars';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
import chalk from 'chalk';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';

const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  user: 'planta',
  host: 'localhost',
  database: 'skatepark',
  password: 'macetero',
  port: 5432,
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cookieParser());

// Configuración de Handlebars
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views', 'layouts'), // Ruta correcta para los layouts
    partialsDir: path.join(__dirname, 'views', 'partials') // Asegúrate de tener un directorio de parciales si lo usas
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views')); // Ruta correcta para las vistas

// Debugging
console.log('Views directory:', app.get('views'));
console.log('Layouts directory:', path.join(__dirname, 'views', 'layouts'));

// Ruta para la página principal
app.get('/', (req, res) => {
    console.log('Rendering index view');
    res.render('index');
});

// Ruta para la página de administración
app.get('/admin', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM skaters');
        console.log('Rendering admin view');
        res.render('admin', { skaters: result.rows });
    } catch (error) {
        console.error(chalk.red(error));
        res.status(500).send('Error en el servidor');
    }
});

// admin.handlebars
app.get('/admin', (req, res) => {
    const skaters = [
      { name: 'Tony Hawk', photo: 'path/to/tony.jpg', yearsOfExperience: 12, specialty: 'Kickflip', active: true },
      { name: 'Evelien Bouilliart', photo: 'path/to/evelien.jpg', yearsOfExperience: 10, specialty: 'Heelflip', active: true },
      { name: 'Danny Way', photo: 'path/to/danny.jpg', yearsOfExperience: 8, specialty: 'Ollie', active: false }
    ];
    
    res.render('admin', { skaters });
  });

// Ruta para registrar nuevos usuarios
app.get('/registro', (req, res) => {
    console.log('Rendering registro view');
    res.render('registro');
});

app.post('/registro', async (req, res) => {
    const { email, name, password, experience, specialty } = req.body;

    // Validar que el archivo photo ha sido subido
    if (!req.files || !req.files.photo) {
        return res.status(400).send('No se ha subido ninguna foto.');
    }

    const { photo } = req.files;
    const hashedPassword = await bcrypt.hash(password, 10);
    const photoPath = `/assets/img/${photo.name}`;

    try {
        await pool.query('INSERT INTO skaters (email, nombre, password, anos_experiencia, especialidad, foto, estado) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
                         [email, name, hashedPassword, experience, specialty, photoPath, false]);
        photo.mv(path.join(__dirname, '..', 'public', photoPath));
        res.redirect('/');
    } catch (error) {
        console.error(chalk.red(error));
        res.status(500).send('Error en postgres');
    }
});



// Ruta para la página de inicio de sesión
app.get('/login', (req, res) => {
    console.log('Rendering login view');
    res.render('login');
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM skaters WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).send('Email o contraseña incorrectos');
        }

        const skater = result.rows[0];
        const isMatch = await bcrypt.compare(password, skater.password);

        if (!isMatch) {
            return res.status(400).send('Email o contraseña incorrectos');
        }

        const token = jwt.sign({ id: skater.id, email: skater.email }, 'secret_key', { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/datos');
    } catch (error) {
        console.error(chalk.red(error));
        res.status(500).send('Error en el servidor');
    }
});

// Ruta para actualizar datos de perfil
app.post('/update', async (req, res) => {
    const { id, nombre, password, anos_experiencia, especialidad } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await pool.query('UPDATE skaters SET nombre = $1, password = $2, anos_experiencia = $3, especialidad = $4 WHERE id = $5', [nombre, hashedPassword, anos_experiencia, especialidad, id]);
        res.redirect('/datos');
    } catch (error) {
        console.error(chalk.red(error));
        res.status(500).send('Error en el servidor');
    }
});

// Ruta para eliminar cuenta
app.post('/delete', async (req, res) => {
    const { id } = req.body;

    try {
        await pool.query('DELETE FROM skaters WHERE id = $1', [id]);
        res.redirect('/');
    } catch (error) {
        console.error(chalk.red(error));
        res.status(500).send('Error en el servidor');
    }
});

// Middleware para verificar JWT
app.use((req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, 'secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).redirect('/login');
    }
});

// Ruta para la página de datos del perfil
app.get('/datos', (req, res) => {
    const perfil = {
      title: 'Datos del Perfil',
      email: 'tonyhawk@skate.com',
      nombre: 'Tony Hawk',
      password: '12345678',
      experiencia: '12',
      especialidad: 'Kickflip'
    };
    res.render('datos', perfil);
  });

app.listen(PORT, () => {
    console.log(chalk.green(`Skatepark corriendo en http://localhost:${PORT}`));
});

