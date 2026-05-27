import os
import io
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("automl.s3")

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://localhost:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_BUCKET = os.getenv("S3_BUCKET", "automl-models")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name="us-east-1",
        )
        try:
            _client.head_bucket(Bucket=S3_BUCKET)
        except ClientError:
            _client.create_bucket(Bucket=S3_BUCKET)
            logger.info("Создан S3-бакет: %s", S3_BUCKET)
    return _client


def upload_bytes(data: bytes, key: str) -> str:
    s3 = _get_client()
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data)
    logger.info("S3 upload: %s (%d bytes)", key, len(data))
    return key


def download_bytes(key: str) -> bytes:
    s3 = _get_client()
    resp = s3.get_object(Bucket=S3_BUCKET, Key=key)
    data = resp["Body"].read()
    logger.info("S3 download: %s (%d bytes)", key, len(data))
    return data


def delete_object(key: str):
    s3 = _get_client()
    s3.delete_object(Bucket=S3_BUCKET, Key=key)
    logger.info("S3 delete: %s", key)


def object_exists(key: str) -> bool:
    s3 = _get_client()
    try:
        s3.head_object(Bucket=S3_BUCKET, Key=key)
        return True
    except ClientError:
        return False
