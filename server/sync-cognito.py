# sync_cognito_groups.py
import boto3
from connect import db

# Initialize Cognito client
cognito_client = boto3.client('cognito-idp', region_name='us-east-1')
USER_POOL_ID = 'us-east-1_HgEmPHJj8'

# Get users collection
users_collection = db.get_collection("users")

# Get all users from MongoDB
users = list(users_collection.find({}))

print(f"Found {len(users)} users in MongoDB")
print("Starting sync...\n")

for user in users:
    email = user['email']
    role = user.get('role', 'Customer')  # Default to Customer if no role
    
    try:
        # Add user to their role group in Cognito
        cognito_client.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=email,
            GroupName=role
        )
        print(f"✓ Added {email} to {role} group")
    except Exception as e:
        print(f"✗ Failed to add {email}: {e}")

print("\nSync completed!")