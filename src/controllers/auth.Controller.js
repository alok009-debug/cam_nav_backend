const bcrypt = require('bcrypt');
const pool = require('../db/sql.db');
const jwt = require('jsonwebtoken');
const { json } = require('express');



const signUp = async (req, res) => {
    try {
        const { username, email, phone, password, fullname } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({
                error: "username , email, password is required"
            })
        }

        const [existingUser] = await pool.query(' SELECT username, email FROM admins WHERE username = ? OR email =? ',
            [username, email]
        );
        const hashSalt = 10;
        const hashedPassword = await bcrypt.hash(password, hashSalt);


        const [result] = await pool.query(
            `INSERT INTO admins (username, email, phone ,password_hash, fullname)
        VALUES(?,?,?,?,?)`,
            [username, email, phone || null, hashedPassword, fullname || null]
        );

        res.status(201).json({
            success: true,
            message: 'Admin created successfully',
            adminId: result.insertId
        })
    } catch (error) {
        console.error("sign Up error", error);
        res.status(500).json({ error: "Failed to create admin account" })
    }

}

const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "username and password are required" });
        }

        // finding user
        const [rows] = await pool.query(
            `SELECT * FROM admins WHERE username = ?`,
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: "invalid credentials" });
        }

        const admin = rows[0];

        const isMatch = await bcrypt.compare(password, admin.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: "invalid credentials" });
        }


        // generate jwt
        const token = jwt.sign(
            { adminId: admin.admin_id, username: admin.username },
            process.env.JWT_SECRET,
            { expiresIn: '7h' }
        );

        res.status(200).json({
            token,
            admin: {
                id: admin.admin_id,
                username: admin.username,
                fullname: admin.fullname,
                email: admin.email,
                phone: admin.phone
            }
        });
    } catch (error) {
        console.error("Login Failed", error);
        res.status(500).json({ error: "Login failed" })
    }
}

const getProfile = async (req, res) => {

    const adminId = req.query.id || req.adminId;

    try {
        const [rows] = await pool.query(
            `SELECT admin_Id, username, email, phone, fullname, created_at FROM admins WHERE admin_Id = ?`,
            [adminId]

        );

        if (rows.length === 0) {
            return res.status(401).json({ error: "admin not found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("error fetching profile", error)
        res.status(500).json({ error: "error in finding admin data" })
    }
}

const getAllAdmins = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT adminId, username, fullname, email, phone, created_at FROM admins`
        );

        if (rows.length === 0) {
            console.error("admin table is empty", error)
        }

        res.json(rows);
    } catch (error) {

        console.error('Error fetching admins:', error);
        res.status(500).json({ error: 'Failed to fetch admins' });
    }
}


module.exports = {
    login,
    signUp,
    getAllAdmins,
    getProfile
}