import hashlib
import os
from .models import Resource, ResourceVersion 
from rest_framework import serializers 


ALLOWED_EXT = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".zip", ".rar", ".png", ".jpg", ".jpeg", ".txt", ".md",
    ".py", ".c", ".cpp", ".h", ".java", ".js", ".ts", ".json", ".csv",
}
MAX_SIZE = 50 * 1024 * 1024


def _checksum(file_obj):
    h = hashlib.sha256()
    file_obj.seek(0)
    for chunk in file_obj.chunks():
        h.update(chunk)
    file_obj.seek(0)
    return h.hexdigest()


class ResourceSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.username", read_only=True)
    download_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = Resource
        fields = (
            "id", "title", "description", "course_name", "semester",
            "file",
            "resource_type", "tags", "status", "version", "file_name",
            "uploaded_by", "uploaded_by_name", "size",
            "created_at", "updated_at", "download_url",
        )
        read_only_fields = (
            "status", "version", "uploaded_by", "size", "file_name",
            "created_at", "updated_at", "download_url",
        )

    def get_download_url(self, obj):
        return f"/api/resources/{obj.pk}/download/"

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else ""

    def validate_file(self, f):
        ext = os.path.splitext(f.name)[1].lower()
        if ext not in ALLOWED_EXT:
            raise serializers.ValidationError(f"File type '{ext}' is not allowed.")
        if f.size > MAX_SIZE:
            raise serializers.ValidationError("File exceeds the 50 MB limit.")
        return f

    def create(self, validated_data):
        f = validated_data["file"]
        validated_data["size"] = f.size
        validated_data["checksum"] = _checksum(f)
        return Resource.objects.create(**validated_data)


class ResourceVersionSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(
        source="uploaded_by.username", read_only=True
    )
    download_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = ResourceVersion
        fields = (
            "id", "version_number", "is_current", "file_name", "size",
            "uploaded_by_name", "created_at", "download_url",
        )

    def get_download_url(self, obj):
        return f"/api/resources/versions/{obj.pk}/download/"

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else ""