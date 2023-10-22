package com.example.expensetracker

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class DatabaseHelper(context: Context):
            SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION){

    companion object{
        private const val DATABASE_NAME = "UserDatabase.db"
        private const val DATABASE_VERSION = 1
    }

    override fun onCreate(db: SQLiteDatabase?) {
        val createTableQuery =  ("CREATE TABLE data (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT , password TEXT)")
        db?.execSQL(createTableQuery)
    }

    override fun onUpgrade(db: SQLiteDatabase?, oldVersion: Int, newVersion: Int) {
        val dropTableQuery = ("DROP TABLE IF EXIST data")
        db?.execSQL(dropTableQuery)
    }

    fun insertUser(username: String, password: String): Boolean {
        val values = ContentValues().apply{
            put("username", username)
            put("password", password)
    }
        val db = writableDatabase
        val result = db.insert("data", null, values)
        if (result == (-1).toLong()){
            return  false
        }
        return true
    }

    fun checkuser(username: String, password: String):Boolean{
        val db = this.writableDatabase
        val query = "SELECT * FROM data WHERE username = ? AND password = ?"
        val selectionArgs = arrayOf(username, password)
        val cursor = readableDatabase.rawQuery(query, selectionArgs)
        if (cursor.count<= 0){
            cursor.close()
            return false
        }
        return true
    }
}