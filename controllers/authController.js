const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminUsername || !adminPassword) {
            return res.status(500).json({ message: 'Server configuration error' });
        }

        if (username === adminUsername && password === adminPassword) {
            const token = jwt.sign(
                { username, role: 'admin' }, 
                process.env.JWT_SECRET, 
                { expiresIn: '24h' }
            );
            
            res.status(200).json({ message: 'Login successful', token });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
};
