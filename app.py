from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash
import sqlite3

app = Flask(__name__)
app.secret_key = 'itm_mocha_gradeforge_secret_key_change_in_production'

DB_NAME = 'sgpa.db'
GP_MAP = {'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 4, 'F': 0}

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # 1. Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)
    # 2. Academic Profile Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INTEGER PRIMARY KEY,
            past_cgpa REAL,
            past_credits INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    # 3. Subjects Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            credits REAL,
            grade TEXT,
            type TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_db()

def calculate_semester_stats(subjects):
    total_pts = 0.0
    total_credits = 0.0
    for s in subjects:
        try:
            cr = float(s.get('credits', 0) or 0)
        except (ValueError, TypeError):
            cr = 0.0
        grade = s.get('grade', 'F')
        gp = GP_MAP.get(grade, 0)
        total_pts += cr * gp
        total_credits += cr
    sgpa = (total_pts / total_credits) if total_credits > 0 else None
    return {'sgpa': sgpa, 'credits': total_credits, 'points': total_pts}

# ----------------- AUTHENTICATION ROUTES ----------------- #

@app.route('/')
def index():
    is_authenticated = 'user_id' in session
    username = session.get('username', '')
    return render_template('index.html', authenticated=is_authenticated, username=username)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('SELECT id, password FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        conn.close()
        
        if user and user[1] == password:
            session['user_id'] = user[0]
            session['username'] = username
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password configuration.', 'error')
            return redirect(url_for('index'))
    return redirect(url_for('index'))

@app.route('/register', methods=['POST'])
def register():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    
    if not username or not password:
        flash('Username and password cannot be empty.', 'error')
        return redirect(url_for('index'))
        
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
        conn.commit()
        cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
        user_id = cursor.fetchone()[0]
        conn.close()
        
        session['user_id'] = user_id
        session['username'] = username
        return redirect(url_for('index'))
    except sqlite3.IntegrityError:
        flash('That username is already taken. Please pick another.', 'error')
        return redirect(url_for('index'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

# ----------------- DATA SYNC APIS ----------------- #

@app.route('/api/get_profile', methods=['GET'])
def get_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT past_cgpa, past_credits FROM user_profiles WHERE user_id = ?', (session['user_id'],))
    profile_row = cursor.fetchone()
    
    cursor.execute('SELECT id, name, credits, grade, type FROM user_subjects WHERE user_id = ?', (session['user_id'],))
    subject_rows = cursor.fetchall()
    conn.close()
    
    subjects = []
    for r in subject_rows:
        subjects.append({
            'id': r[0],
            'name': r[1],
            'credits': r[2],
            'grade': r[3],
            'type': r[4]
        })
        
    past_cgpa = profile_row[0] if profile_row and profile_row[0] is not None else ""
    past_credits = profile_row[1] if profile_row and profile_row[1] is not None else ""
    
    return jsonify({
        'pastCGPA': past_cgpa,
        'pastCredits': past_credits,
        'subjects': subjects
    })

@app.route('/api/simulate', methods=['POST'])
def simulate():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.get_json() or {}
    user_id = session['user_id']
    
    try:
        past_cgpa = float(data.get('pastCGPA', 0) or 0)
    except (ValueError, TypeError):
        past_cgpa = 0.0
        
    try:
        past_credits = float(data.get('pastCredits', 0) or 0)
    except (ValueError, TypeError):
        past_credits = 0.0
        
    past_points = past_cgpa * past_credits
    
    current_subjects = data.get('currentSubjects', [])
    cur_stats = calculate_semester_stats(current_subjects)
    
    new_total_credits = past_credits + cur_stats['credits']
    new_total_points = past_points + cur_stats['points']
    new_cgpa = (new_total_points / new_total_credits) if new_total_credits > 0 else None
    
    whatif_subjects = data.get('whatifSubjects', [])
    wif_stats = calculate_semester_stats(whatif_subjects)
    
    proj_credits = new_total_credits + wif_stats['credits']
    proj_points = new_total_points + wif_stats['points']
    proj_cgpa = (proj_points / proj_credits) if proj_credits > 0 else None
    
    active_cgpa = proj_cgpa if (proj_cgpa is not None and wif_stats['credits'] > 0) else new_cgpa
    
    # Save user state
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_profiles (user_id, past_cgpa, past_credits)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET 
                past_cgpa = excluded.past_cgpa,
                past_credits = excluded.past_credits
        """, (user_id, past_cgpa, past_credits))
        
        cursor.execute('DELETE FROM user_subjects WHERE user_id = ?', (user_id,))
        for s in current_subjects:
            cursor.execute("""
                INSERT INTO user_subjects (user_id, name, credits, grade, type)
                VALUES (?, ?, ?, ?, 'current')
            """, (user_id, s.get('name', ''), float(s.get('credits', 0) or 0), s.get('grade', 'A')))
            
        for s in whatif_subjects:
            cursor.execute("""
                INSERT INTO user_subjects (user_id, name, credits, grade, type)
                VALUES (?, ?, ?, ?, 'whatif')
            """, (user_id, s.get('name', ''), float(s.get('credits', 0) or 0), s.get('grade', 'A')))
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Database write error: {e}")
        
    return jsonify({
        'currentSGPA': cur_stats['sgpa'],
        'currentCredits': cur_stats['credits'],
        'whatifSGPA': wif_stats['sgpa'],
        'whatifCredits': wif_stats['credits'],
        'newCGPA': new_cgpa,
        'projectedCGPA': proj_cgpa,
        'activeCGPA': active_cgpa
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)