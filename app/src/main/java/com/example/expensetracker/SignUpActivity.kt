package com.example.expensetracker

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.Toast
import com.example.expensetracker.databinding.ActivitySignUpBinding

class SignUpActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySignUpBinding
    private lateinit var databaseHelper: DatabaseHelper


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySignUpBinding.inflate(layoutInflater)
        setContentView(binding.root)

        databaseHelper = DatabaseHelper(this)

        binding.signupButton.setOnClickListener {
            val signUpUsername = binding.signUpUsername.text.toString()
            val signUpPassword = binding.signUpPassword.text.toString()
            signupDatabase(signUpUsername, signUpPassword)
        }

        binding.redirectLogin.setOnClickListener{
            val intent = Intent(this, LoginActivity::class.java)
            startActivity(intent)
            finish()
        }
    }

    private fun signupDatabase(username: String, password: String){
        val insertedRowId = databaseHelper.insertUser(username, password)
        if (insertedRowId != -1L){
            Toast.makeText(this, "SignUp Successful", Toast.LENGTH_SHORT).show()
            val intent = Intent(this, LoginActivity::class.java)
            startActivity(intent)
            finish()
        }else {
            Toast.makeText(this, "SignUp Failed", Toast.LENGTH_SHORT).show()
        }
    }
}