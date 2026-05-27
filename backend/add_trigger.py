import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

conn = psycopg2.connect(dbname='expense_tracker', user='postgres', password='root', host='localhost', port=5432)
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur = conn.cursor()

sql = """
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$ 
BEGIN 
    NEW.updated_at = NOW(); 
    RETURN NEW; 
END; 
$$ LANGUAGE plpgsql; 

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions; 
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
"""

cur.execute(sql)
cur.close()
conn.close()
print("Trigger added successfully!")
