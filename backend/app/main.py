import mimetypes
import os
import shutil
from pathlib import Path
from typing import List, Optional

import psycopg2
from psycopg2 import OperationalError, IntegrityError, ProgrammingError, DatabaseError
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends
import uuid
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware
from passlib.hash import bcrypt
from pydantic import BaseModel
from fastapi.responses import FileResponse
import smtplib
from email.mime.text import MIMEText
import zipfile
import io
from fastapi.responses import StreamingResponse


app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET"],
    same_site="lax",
    https_only=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DBConnector:
    def __init__(self):
        self.dsn = {
            "database": os.environ["POSTGRES_DB"],
            "user": os.environ["POSTGRES_USER"],
            "password": os.environ["POSTGRES_PASSWORD"],
            "host": os.environ.get("POSTGRES_HOST", "db"),
            "port": os.environ.get("POSTGRES_PORT", 5432),
        }

    def _execute(self, query: str, params: tuple = (), is_read: bool = True):
        connection = None
        try:
            connection = psycopg2.connect(**self.dsn)
            cursor = connection.cursor()
            cursor.execute(query, params)

            if is_read:
                return cursor.fetchall()
            else:
                connection.commit()
                return cursor.rowcount

        except OperationalError as e:
            print(f"Missing table or connection error\n{e}")
            return [] if is_read else 0

        except IntegrityError as e:
            print(f"Conflict with database constraints (eg. ID already exists)\n{e}")
            return [] if is_read else 0

        except ProgrammingError as e:
            print(f"Wrong parameters in query\n{e}")
            return [] if is_read else 0

        except DatabaseError as e:
            print(f"An unexpected error occurred\n{e}")
            return [] if is_read else 0

        finally:
            if connection is not None:
                connection.close()

    def execute_read_query(self, query: str, params: tuple = ()) -> list:
        return self._execute(query, params, is_read=True)

    def execute_write_query(self, query: str, params: tuple = ()) -> int:
        return self._execute(query, params, is_read=False)




class DBManager():

    connection = DBConnector()

    def add_customer(self, customer_id, name, email):
        query = """
            INSERT INTO customers(customer_id, name, email)
            VALUES(%s, %s, %s)
            ON CONFLICT (customer_id) DO NOTHING
        """
        self.connection.execute_write_query(query, (customer_id, name, email))

    def get_customers(self):
        query = """
            SELECT c.customer_id, c.name, c.email, COUNT(o.order_id) AS order_count
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.customer_id
            GROUP BY c.customer_id, c.name, c.email
            ORDER BY c.name
        """
        return self.connection.execute_read_query(query)
    
    def add_order(self, order_id, customer_id, order_number, product_name):
        query = """
            INSERT INTO orders(order_id, customer_id, order_number, product_name)
            VALUES(%s, %s, %s, %s)
        """
        return self.connection.execute_write_query(query, (order_id, customer_id, order_number, product_name))
    
    def get_orders(self, customer_id=None, status=None, search=None):
        conditions = []
        params = []

        if customer_id:
            conditions.append("o.customer_id = %s")
            params.append(customer_id)

        if search:
            conditions.append("(o.product_name ILIKE %s OR o.order_number ILIKE %s)")
            like = f"%{search}%"
            params.extend([like, like])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        query = f"""
            SELECT o.order_id, o.customer_id, o.order_number, o.product_name, o.created_at,
                   c.name, c.email,
                   COALESCE(latest.status, 'pending') AS status
            FROM orders o
            JOIN customers c ON c.customer_id = o.customer_id
            LEFT JOIN LATERAL (
                SELECT status FROM versions v
                WHERE v.order_id = o.order_id
                ORDER BY v.version_number DESC
                LIMIT 1
            ) latest ON true
            {where_clause}
            ORDER BY o.created_at DESC
        """

        rows = self.connection.execute_read_query(query, tuple(params))
        if status:
            rows = [row for row in rows if row[7] == status]
        return rows


    def count_orders(self):
        query = """
            SELECT COUNT(*)
            FROM orders
        """
        result = self.connection.execute_read_query(query)
        return result[0][0] if result else 0
        
    
    def add_version(self, version_id, order_id, version_number, pdf_path, status):
        query = """
            INSERT INTO versions(version_id, order_id, version_number, pdf_path, status)
            VALUES(%s, %s, %s, %s, %s)
        """
        
        return self.connection.execute_write_query(query, (version_id, order_id, version_number, pdf_path, status))
    
    def get_next_version_number(self, order_id):
        query = "SELECT COUNT(*) FROM versions WHERE order_id = %s"
        result = self.connection.execute_read_query(query, (order_id,))
        return (result[0][0] if result else 0) + 1

    def get_versions(self, order_id):
        query = """
            SELECT version_id, order_id, version_number, pdf_path, status, created_at, feedback
            FROM versions
            WHERE order_id = %s
            ORDER BY version_number
        """
        return self.connection.execute_read_query(query, (order_id,))
    
    def get_order_by_id(self, order_id):
        query = """
            SELECT o.order_id, o.customer_id, o.order_number, o.product_name, o.created_at,
                   c.name, c.email
            FROM orders o
            JOIN customers c ON c.customer_id = o.customer_id
            WHERE o.order_id = %s
        """
        rows = self.connection.execute_read_query(query, (order_id,))
        return rows[0] if rows else None

    def get_version_by_id(self, version_id):
        query = """
            SELECT version_id, order_id, version_number, pdf_path, status, created_at
            FROM versions
            WHERE version_id = %s
        """
        rows = self.connection.execute_read_query(query, (version_id,))
        return rows[0] if rows else None
    
    def add_response(self, version_id, status, feedback):
        query = """
            UPDATE versions
            SET status = %s,
                feedback = %s
            WHERE version_id = %s
        """

        return self.connection.execute_write_query(query, (status, feedback, version_id))

    def add_annotation(self, annotation_id, version_id, filename, page_number, x, y, comment):
        query = """
            INSERT INTO annotations(annotation_id, version_id, filename, page_number, x, y, comment)
            VALUES(%s, %s, %s, %s, %s, %s, %s)
        """
        return self.connection.execute_write_query(
            query, (annotation_id, version_id, filename, page_number, x, y, comment)
        )

    def get_annotation_by_id(self, annotation_id):
        query = """
            SELECT annotation_id, filename, page_number, x, y, comment, created_at
            FROM annotations
            WHERE annotation_id = %s
        """
        rows = self.connection.execute_read_query(query, (annotation_id,))
        return rows[0] if rows else None

    def get_annotations(self, version_id, filename, page_number=None):
        conditions = ["version_id = %s", "filename = %s"]
        params = [version_id, filename]

        if page_number is not None:
            conditions.append("page_number = %s")
            params.append(page_number)

        query = f"""
            SELECT annotation_id, filename, page_number, x, y, comment, created_at
            FROM annotations
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at
        """
        return self.connection.execute_read_query(query, tuple(params))

    def delete_annotation(self, annotation_id):
        query = "DELETE FROM annotations WHERE annotation_id = %s"
        return self.connection.execute_write_query(query, (annotation_id,))



DBMan = DBManager()

def send_approval_email(to_email: str, customer_name: str, link: str, order_number: str, product_name: str, email_message: str):
    body = (
        f"Kedves {customer_name}!\n\n"
        f"{email_message}\n"
        f"Kérjük, ellenőrizze és hagyja jóvá az alábbi linken:\n\n{link}\n\n"
        f"Üdvözlettel,\nA nyomda csapata"
    )
    
    email_message

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"Print2000 Nyomda, jóváhagyásra vár: {product_name}"
    msg["From"] = os.environ["FROM_EMAIL"]
    msg["To"] = to_email

    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ["SMTP_PORT"])) as server:
        server.starttls()
        server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        server.send_message(msg)


def send_response_email(link: str, product_name: str, response_status: str, response_message: str, customer_email: str):
    body = (
        f"{response_message}"
        f"Kérjük, ellenőrizze és hagyja jóvá az alábbi linken:\n\n{link}\n\n"
    )
    
    if(response_status == "approved"):
        response_status_hu = "Elfogadva"
    elif(response_status == "changes_requested"):
        response_status_hu = "Javítás kérve"
    else:
        response_status_hu = "Függőben"
    
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"A(z) {product_name} rendeléséhez tartozó látványtervhez visszajelzés érkezett: {response_status_hu}.\n"
    msg["From"] = customer_email
    msg["To"] = os.environ["FROM_EMAIL"]

    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ["SMTP_PORT"])) as server:
        server.starttls()
        server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        server.send_message(msg)
    
    
def require_auth(request: Request):
    if not request.session.get("admin"):
        raise HTTPException(status_code=401, detail="Nincs bejelentkezve")



@app.get("/health")
def health_check():
    return {"status": "ok"}

class LoginRequest(BaseModel):
    password: str

@app.post("/login")
def login(payload: LoginRequest, request: Request):
    if not bcrypt.verify(payload.password, os.environ["ADMIN_PASSWORD_HASH"]):
        raise HTTPException(status_code=401, detail="Hibás jelszó")

    request.session["admin"] = True
    return {"status": "ok"}



UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
CHUNK_SIZE = 1024 * 1024  # 1 MB



@app.post("/orders/{order_id}/versions")
async def upload_version(
            order_id: str,
            email_message: str = Form(""),
            files: List[UploadFile] = File(...),
            _: None = Depends(require_auth),
        ):
    
    version_id = str(uuid.uuid4())
    version_dir = UPLOAD_DIR / version_id
    version_dir.mkdir(parents=True, exist_ok=True)

    try:
        for file in files:
            unique_name = f"{uuid.uuid4()}_{file.filename}"
            filepath = version_dir / unique_name

            size = 0
            with filepath.open("wb") as buffer:
                while True:
                    chunk = await file.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_FILE_SIZE:
                        raise HTTPException(status_code=413, detail="A fájl túl nagy")
                    buffer.write(chunk)
    except HTTPException:
        shutil.rmtree(version_dir, ignore_errors=True)
        raise

    # one row per upload batch, regardless of how many files it contains
    version_number = DBMan.get_next_version_number(order_id)

    rows_affected = DBMan.add_version(version_id, order_id, version_number, str(version_dir), "pending")
    if not rows_affected:
        shutil.rmtree(version_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Érvénytelen rendelés azonosító")
    
    
    order_info = DBMan.get_order_by_id(order_id)
    if order_info:
        _, _, order_number, product_name, _, customer_name, customer_email = order_info
        link = f"{os.environ['FRONTEND_BASE_URL']}/review/{order_id}/{version_id}"
        try:
            send_approval_email(customer_email, customer_name, link, order_number, product_name, email_message)
        except Exception as e:
            print(f"Email küldése sikertelen: {e}")
    
    return {
        "version_id": version_id,
        "version_number": version_number,
        "file_count": len(files),
    }


class NewOrderRequest(BaseModel):
    customer_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    product_name: str

@app.get("/customers")
def list_customers(_: None = Depends(require_auth)):
    customers = DBMan.get_customers()
    return [
        {"customer_id": row[0], "name": row[1], "email": row[2], "order_count": row[3]}
        for row in customers
    ]

@app.get("/orders")
def list_orders(
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    _: None = Depends(require_auth),
):
    orders = DBMan.get_orders(customer_id=customer_id, status=status, search=q)
    return [
        {
            "order_id": row[0],
            "customer_id": row[1],
            "order_number": row[2],
            "product_name": row[3],
            "created_at": row[4],
            "customer_name": row[5],
            "customer_email": row[6],
            "status": row[7],
        }
        for row in orders
    ]

@app.post("/add_order")
def add_order(payload: NewOrderRequest, _: None = Depends(require_auth)):
    customer_id = payload.customer_id
    if not customer_id:
        if not payload.name or not payload.email:
            raise HTTPException(status_code=400, detail="Adja meg az ügyfél nevét és e-mail címét")
        customer_id = str(uuid.uuid4())
        DBMan.add_customer(customer_id, payload.name, payload.email)

    order_id = str(uuid.uuid4())
    next_number = DBMan.count_orders() + 1
    order_number = f"{next_number:04d}"

    rows_affected = DBMan.add_order(order_id, customer_id, order_number, payload.product_name)
    if not rows_affected:
        raise HTTPException(status_code=400, detail="A rendelés létrehozása sikertelen, ellenőrizze az ügyfél azonosítót")

    return {
        "order_id": order_id,
        "order_number": order_number,
    }


@app.get("/orders/{order_id}")
def get_order(order_id: str, _: None = Depends(require_auth)):
    order = DBMan.get_order_by_id(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="A rendelés nem található")

    return {
        "order_id": order[0],
        "customer_id": order[1],
        "order_number": order[2],
        "product_name": order[3],
        "created_at": order[4],
        "customer_name": order[5],
        "customer_email": order[6],
    }
    
    


@app.get("/orders/{order_id}/versions")
def list_versions(order_id: str):
    versions = DBMan.get_versions(order_id)
    return [
        {
            "version_id": row[0],
            "order_id": row[1],
            "version_number": row[2],
            "pdf_path": row[3],
            "status": row[4],
            "created_at": row[5],
            "feedback": row[6],
        }
        for row in versions
    ]


@app.get("/orders/{order_id}/versions/{version_id}/files")
def list_version_files(order_id: str, version_id: str):
    version_dir = UPLOAD_DIR / version_id
    if not version_dir.exists():
        raise HTTPException(status_code=404, detail="A verzió nem található")

    return {"files": [f.name for f in version_dir.iterdir() if f.is_file()]}


@app.get("/orders/{order_id}/versions/{version_id}/files/{filename}")
def get_version_file(order_id: str, version_id: str, filename: str):
    safe_filename = Path(filename).name
    filepath = UPLOAD_DIR / version_id / safe_filename

    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="A fájl nem található")


    original_name = safe_filename.split("_", 1)[-1] if "_" in safe_filename else safe_filename
    return FileResponse(
        filepath,
        filename=original_name,
        media_type="application/octet-stream",
    )


@app.get("/orders/{order_id}/versions/{version_id}/view/{filename}")
def view_version_file(order_id: str, version_id: str, filename: str):
    safe_filename = Path(filename).name
    filepath = UPLOAD_DIR / version_id / safe_filename

    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="A fájl nem található")

    original_name = safe_filename.split("_", 1)[-1] if "_" in safe_filename else safe_filename
    media_type, _ = mimetypes.guess_type(original_name)
    if media_type is None:
        media_type = "application/octet-stream"

    return FileResponse(
        filepath,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{original_name}"'},
    )


class AnnotationCreate(BaseModel):
    filename: str
    page_number: int = 1
    x: float
    y: float
    comment: str


def _serialize_annotation(row):
    return {
        "annotation_id": row[0],
        "filename": row[1],
        "page_number": row[2],
        "x": row[3],
        "y": row[4],
        "comment": row[5],
        "created_at": row[6],
    }


@app.post("/orders/{order_id}/versions/{version_id}/annotations")
def create_annotation(order_id: str, version_id: str, payload: AnnotationCreate):
    annotation_id = str(uuid.uuid4())
    rows_affected = DBMan.add_annotation(
        annotation_id,
        version_id,
        payload.filename,
        payload.page_number,
        payload.x,
        payload.y,
        payload.comment,
    )
    if not rows_affected:
        raise HTTPException(status_code=400, detail="Az annotáció mentése sikertelen")

    annotation = DBMan.get_annotation_by_id(annotation_id)
    return _serialize_annotation(annotation)


@app.get("/orders/{order_id}/versions/{version_id}/annotations")
def list_annotations(order_id: str, version_id: str, filename: str, page_number: Optional[int] = None):
    rows = DBMan.get_annotations(version_id, filename, page_number)
    return [_serialize_annotation(row) for row in rows]


@app.delete("/orders/{order_id}/versions/{version_id}/annotations/{annotation_id}")
def remove_annotation(order_id: str, version_id: str, annotation_id: str):
    rows_affected = DBMan.delete_annotation(annotation_id)
    if not rows_affected:
        raise HTTPException(status_code=404, detail="Az annotáció nem található")
    return {"status": "ok"}


@app.get("/orders/{order_id}/versions/{version_id}/download")
def download_version_zip(order_id: str, version_id: str):
    version_dir = UPLOAD_DIR / version_id
    if not version_dir.exists():
        raise HTTPException(status_code=404, detail="A verzió nem található")

    version = DBMan.get_version_by_id(version_id)
    order = DBMan.get_order_by_id(order_id)

    version_number = version[2] if version else "1"
    product_name = order[3] if order else "verzio"

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for filepath in version_dir.iterdir():
            if filepath.is_file():
                original_name = filepath.name.split("_", 1)[-1] if "_" in filepath.name else filepath.name
                zip_file.write(filepath, arcname=original_name)

    zip_buffer.seek(0)

    safe_product_name = "".join(c for c in product_name if c.isalnum() or c in (" ", "_", "-")).strip()

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_product_name}_v{version_number}.zip"'},
    )
    
    
@app.post("/review/{order_id}/{version_id}/feedback")
async def customer_feedback(
    order_id: str,
    version_id: str,
    status: str = Form(...),  # "approved" vagy "changes_requested"
    message: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
):
    order = DBMan.get_order_by_id(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="A rendelés nem található")

    _, _, order_number, product_name, _, customer_name, customer_email = order

    if files:
        response_dir = UPLOAD_DIR / version_id / "response"
        response_dir.mkdir(parents=True, exist_ok=True)
        for file in files:
            if not file.filename:
                continue
            unique_name = f"{uuid.uuid4()}_{file.filename}"
            filepath = response_dir / unique_name

            size = 0
            with filepath.open("wb") as buffer:
                while True:
                    chunk = await file.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_FILE_SIZE:
                        filepath.unlink(missing_ok=True)
                        raise HTTPException(status_code=413, detail="A fájl túl nagy")
                    buffer.write(chunk)

    link = f"{os.environ['FRONTEND_BASE_URL']}/admin/orders/{order_id}"

    try:
        send_response_email(link, product_name, status, message, customer_email)
        DBMan.add_response(version_id, status, message)


    except Exception as e:
        print(f"Válasz email küldése sikertelen: {e}")

    return {"status": "ok"}


@app.get("/orders/{order_id}/versions/{version_id}/response-files")
def list_response_files(order_id: str, version_id: str, _: None = Depends(require_auth)):
    response_dir = UPLOAD_DIR / version_id / "response"
    if not response_dir.exists():
        return {"files": []}

    return {"files": [f.name for f in response_dir.iterdir() if f.is_file()]}


@app.get("/orders/{order_id}/versions/{version_id}/response-files/{filename}")
def get_response_file(order_id: str, version_id: str, filename: str, _: None = Depends(require_auth)):
    safe_filename = Path(filename).name
    filepath = UPLOAD_DIR / version_id / "response" / safe_filename

    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="A fájl nem található")

    original_name = safe_filename.split("_", 1)[-1] if "_" in safe_filename else safe_filename
    return FileResponse(
        filepath,
        filename=original_name,
        media_type="application/octet-stream",
    )